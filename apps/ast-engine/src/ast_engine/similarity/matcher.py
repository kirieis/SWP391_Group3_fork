"""So khớp fingerprint giữa các bài nộp của cùng một assignment.

Ý TƯỞNG (đọc trước khi đọc code)
================================
Mỗi bài nộp có một tập hash (fingerprint). Hai bài càng chia sẻ nhiều hash thì càng giống.

        Bài A: { h1 h2 h3 h4 h5 h6 }
        Bài B: {    h3 h4 h5 h6 h7 h8 h9 h10 }
                    └──────┬──────┘
                    4 hash chung

  similarity % = số hash chung / số hash của bài NHỎ HƠN × 100     (overlap coefficient)

Vì sao chia cho bài nhỏ hơn mà không dùng Jaccard (chung / hợp)?
  Kẻ đạo văn hay chép cả bài rồi THÊM code thừa cho dài ra. Jaccard bị loãng và báo
  thấp; overlap coefficient vẫn báo cao vì phần được chép nằm gọn trong bài dài hơn.
  (Jaccard vẫn được tính kèm để tiện thống kê cho bài báo IEEE.)

Hai chế độ fingerprint (xem analyzer.py):
    "ast" : từ parse tree — chống đổi tên + đảo hàm.  Dùng khi CẢ HAI bài parse được.
    "lex" : từ lexer      — luôn có.                   Dùng khi ít nhất một bài parse lỗi.
  Không so "ast" với "lex" vì hai loại token khác nhau hoàn toàn.

Phân loại (SRS v1.2):
    0 – <30 %  : SAFE        30 – 60 % : WARNING       > 60 % : DANGER
    DANGER -> flag PLAGIARISM_DETECTED, giữ điểm (SCORE_WITHHELD) chờ giảng viên duyệt.

Chống false-positive (rủi ro R04): truyền `whitelist` = tập hash của code mẫu/boilerplate
do giảng viên cung cấp; các hash này bị loại khỏi cả hai bên trước khi so.

matched_fragments: danh sách cặp đoạn dòng trùng (bài A, bài B) để sinh viên appeal
và giảng viên xem hàm/đoạn nào bị trùng.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from itertools import combinations
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

from ast_engine.fingerprint.winnowing import Fingerprint

# Ngưỡng theo SRS v1.2. Nếu config.py của bạn đã có hằng số tương ứng, import từ đó.
THRESHOLD_WARNING = 30.0
THRESHOLD_DANGER = 60.0

LEVEL_SAFE = "SAFE"
LEVEL_WARNING = "WARNING"
LEVEL_DANGER = "DANGER"

FLAG_PLAGIARISM = "PLAGIARISM_DETECTED"


def classify(similarity_percent: float) -> str:
    """0-30 SAFE, 30-60 WARNING, >60 DANGER (đúng 60 vẫn là WARNING)."""
    if similarity_percent > THRESHOLD_DANGER:
        return LEVEL_DANGER
    if similarity_percent >= THRESHOLD_WARNING:
        return LEVEL_WARNING
    return LEVEL_SAFE


@dataclass
class SubmissionFingerprints:
    """Toàn bộ fingerprint của một bài nộp (do analyzer.analyze_source tạo ra)."""

    submission_id: str
    lex: Fingerprint                      # luôn có
    ast: Optional[Fingerprint] = None     # None nếu bài không parse được
    parse_ok: bool = False
    syntax_error_count: int = 0
    # Vì sao không có fingerprint "ast": None | "SYNTAX_ERROR" | "PARSER_FAILED" | "NORMALIZATION_FAILED" | "PARSE_TIMEOUT"
    fallback_reason: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "submission_id": self.submission_id,
            "parse_ok": self.parse_ok,
            "syntax_error_count": self.syntax_error_count,
            "fallback_reason": self.fallback_reason,
            "lex": self.lex.to_dict(),
            "ast": self.ast.to_dict() if self.ast else None,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "SubmissionFingerprints":
        return cls(
            submission_id=str(data["submission_id"]),
            lex=Fingerprint.from_dict(data["lex"]),
            ast=Fingerprint.from_dict(data["ast"]) if data.get("ast") else None,
            parse_ok=bool(data.get("parse_ok", False)),
            syntax_error_count=int(data.get("syntax_error_count", 0)),
            fallback_reason=data.get("fallback_reason"),
        )


@dataclass(frozen=True)
class MatchedFragment:
    """Một đoạn trùng: dòng [a_start, a_end] của bài A ~ dòng [b_start, b_end] của bài B."""

    a_start: int
    a_end: int
    b_start: int
    b_end: int

    def to_dict(self) -> dict:
        return {
            "a_lines": [self.a_start, self.a_end],
            "b_lines": [self.b_start, self.b_end],
        }


@dataclass
class PlagiarismMatch:
    """Kết quả so khớp một cặp — khớp cột của bảng PLAGIARISM_MATCHES."""

    submission_1_id: str
    submission_2_id: str
    similarity_percent: float
    level: str
    mode: str                              # "ast" hoặc "lex"
    shared_hashes: int = 0
    jaccard_percent: float = 0.0
    matched_fragments: List[MatchedFragment] = field(default_factory=list)
    note: Optional[str] = None             # vd: "INSUFFICIENT_DATA" khi bài quá ngắn

    @property
    def flag(self) -> Optional[str]:
        """Chỉ mức DANGER mới gắn cờ và giữ điểm."""
        return FLAG_PLAGIARISM if self.level == LEVEL_DANGER else None

    def to_dict(self) -> dict:
        return {
            "submission_1_id": self.submission_1_id,
            "submission_2_id": self.submission_2_id,
            "similarity_percent": round(self.similarity_percent, 2),
            "level": self.level,
            "flag": self.flag,
            "mode": self.mode,
            "shared_hashes": self.shared_hashes,
            "jaccard_percent": round(self.jaccard_percent, 2),
            "matched_fragments": [f.to_dict() for f in self.matched_fragments],
            "note": self.note,
        }


# --------------------------------------------------------------------------- #
# So khớp một cặp
# --------------------------------------------------------------------------- #


def _pick_mode(a: SubmissionFingerprints, b: SubmissionFingerprints) -> Tuple[Fingerprint, Fingerprint]:
    """Dùng "ast" nếu CẢ HAI có; ngược lại rơi về "lex"."""
    if a.ast is not None and b.ast is not None:
        return a.ast, b.ast
    return a.lex, b.lex


def _positions_by_hash(fp: Fingerprint, whitelist: Optional[Set[int]]) -> Dict[int, List[int]]:
    result: Dict[int, List[int]] = defaultdict(list)
    for h, pos in fp.entries:
        if whitelist and h in whitelist:
            continue
        result[h].append(pos)
    return result


def _line_range(fp: Fingerprint, pos: int) -> Tuple[int, int]:
    """k-gram bắt đầu ở token `pos` phủ token pos..pos+k-1 -> đổi ra khoảng dòng nguồn."""
    lines = fp.token_lines[pos : pos + fp.k]
    lines = [x for x in lines if x > 0]
    if not lines:
        return (pos, pos)  # không có thông tin dòng: dùng chỉ số token thay thế
    return (min(lines), max(lines))


def _build_fragments(
    fa: Fingerprint,
    fb: Fingerprint,
    shared: Iterable[int],
    pos_a: Dict[int, List[int]],
    pos_b: Dict[int, List[int]],
) -> List[MatchedFragment]:
    """Đổi các hash chung thành các đoạn dòng trùng, gộp những đoạn liền kề/chồng nhau."""
    ranges: List[Tuple[int, int, int, int]] = []
    for h in shared:
        for pa, pb in zip(pos_a[h], pos_b[h]):
            a_lo, a_hi = _line_range(fa, pa)
            b_lo, b_hi = _line_range(fb, pb)
            ranges.append((a_lo, a_hi, b_lo, b_hi))
    ranges.sort()

    merged: List[List[int]] = []
    for a_lo, a_hi, b_lo, b_hi in ranges:
        if merged:
            m = merged[-1]
            # gộp nếu đoạn của A liền/chồng VÀ đoạn của B cũng liền/chồng
            if a_lo <= m[1] + 1 and b_lo <= m[3] + 1 and b_hi >= m[2] - 1:
                m[1] = max(m[1], a_hi)
                m[2] = min(m[2], b_lo)
                m[3] = max(m[3], b_hi)
                continue
        merged.append([a_lo, a_hi, b_lo, b_hi])
    return [MatchedFragment(*m) for m in merged]


def compare(
    a: SubmissionFingerprints,
    b: SubmissionFingerprints,
    *,
    whitelist: Optional[Set[int]] = None,
    with_fragments: bool = True,
) -> PlagiarismMatch:
    """So khớp hai bài nộp. `whitelist`: tập hash của code mẫu cần loại trừ (R04)."""
    fa, fb = _pick_mode(a, b)

    def result(percent: float, **kwargs) -> PlagiarismMatch:
        return PlagiarismMatch(
            submission_1_id=a.submission_id,
            submission_2_id=b.submission_id,
            similarity_percent=percent,
            level=classify(percent),
            mode=fa.mode,
            **kwargs,
        )

    if fa.too_short or fb.too_short:
        return result(0.0, note="INSUFFICIENT_DATA")

    pos_a = _positions_by_hash(fa, whitelist)
    pos_b = _positions_by_hash(fb, whitelist)
    if not pos_a or not pos_b:
        return result(0.0, note="INSUFFICIENT_DATA")

    shared = set(pos_a) & set(pos_b)
    percent = 100.0 * len(shared) / min(len(pos_a), len(pos_b))
    jaccard = 100.0 * len(shared) / len(set(pos_a) | set(pos_b))
    fragments = _build_fragments(fa, fb, shared, pos_a, pos_b) if with_fragments and shared else []
    return result(
        percent,
        shared_hashes=len(shared),
        jaccard_percent=jaccard,
        matched_fragments=fragments,
    )


# --------------------------------------------------------------------------- #
# So khớp cả lớp
# --------------------------------------------------------------------------- #


def _candidate_pairs(subs: Sequence[SubmissionFingerprints]) -> Set[Tuple[int, int]]:
    """Chỉ những cặp chia sẻ ÍT NHẤT MỘT hash mới đáng so (chỉ mục ngược hash -> bài).

    Tránh O(n²) so sánh đầy đủ: lớp 100 sinh viên có 4950 cặp nhưng đa số không chung hash nào.
    """
    pairs: Set[Tuple[int, int]] = set()
    for attr in ("ast", "lex"):
        index: Dict[int, List[int]] = defaultdict(list)
        for i, sub in enumerate(subs):
            fp = getattr(sub, attr)
            if fp is None:
                continue
            for h in fp.hash_set:
                index[h].append(i)
        for owners in index.values():
            if len(owners) > 1:
                pairs.update(combinations(owners, 2))
    return pairs


def compare_all(
    subs: Sequence[SubmissionFingerprints],
    *,
    whitelist: Optional[Set[int]] = None,
    min_percent: float = 0.0,
    with_fragments: bool = True,
) -> List[PlagiarismMatch]:
    """So khớp mọi cặp trong một assignment; trả về danh sách giảm dần theo similarity."""
    matches: List[PlagiarismMatch] = []
    for i, j in sorted(_candidate_pairs(subs)):
        m = compare(subs[i], subs[j], whitelist=whitelist, with_fragments=with_fragments)
        if m.similarity_percent >= min_percent:
            matches.append(m)
    matches.sort(key=lambda m: m.similarity_percent, reverse=True)
    return matches
