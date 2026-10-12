#!/usr/bin/env python3
"""Đo recall / báo nhầm của AST Engine trên bộ dữ liệu ngụy trang.

Dùng cho: (1) mục tiêu M2 "phát hiện > 80% đạo văn thật" trong AST Bypass Challenge,
          (2) số liệu thực nghiệm của bài báo IEEE (Winnowing, thử nhiều k/window).

Cấu trúc dữ liệu (tests/fixtures/plagiarism/dataset/):

    <nhóm>/original.java        bài gốc
    <nhóm>/l1_rename.java ...   BIẾN THỂ ĐẠO VĂN của bài gốc (tên file bắt đầu bằng "l<số>_")
    <nhóm>/independent.java     bài do người khác viết ĐỘC LẬP cho cùng đề  -> KHÔNG phải đạo văn

Cặp DƯƠNG (đạo văn thật):  original  vs  mỗi biến thể lN_*  trong cùng nhóm.
Cặp ÂM (không phải đạo văn): original vs independent (cùng nhóm)
                             và mọi cặp giữa các bài thuộc nhóm khác nhau.

Một cặp được coi là "bị phát hiện" khi:
    mức DANGER  : similarity > 60%   (bị gắn cờ + giữ điểm)
    mức WARNING : similarity >= 30%  (gồm cả DANGER; giảng viên được cảnh báo)

Cách chạy (từ thư mục apps/ast-engine):
    python scripts/evaluate_recall.py
    python scripts/evaluate_recall.py --sweep              # thử thêm nhiều cặp (k, window)
    python scripts/evaluate_recall.py --md reports/recall.md
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ast_engine.analyzer import analyze_source  # noqa: E402
from ast_engine.similarity.matcher import (  # noqa: E402
    LEVEL_DANGER,
    LEVEL_SAFE,
    SubmissionFingerprints,
    compare,
)

DEFAULT_DATASET = ROOT / "tests" / "fixtures" / "plagiarism" / "dataset"
LEVEL_RE = re.compile(r"^l(\d+)_")
# (k, window); phần tử ĐẦU là cấu hình mặc định của engine, các phần tử sau để so sánh
DEFAULT_SWEEP = [(15, 25), (25, 40), (10, 15), (8, 12), (5, 8)]


def load(dataset: Path, k: int, window: int) -> Dict[str, Dict[str, SubmissionFingerprints]]:
    """{nhóm: {tên_file_không_đuôi: SubmissionFingerprints}}"""
    groups: Dict[str, Dict[str, SubmissionFingerprints]] = {}
    for gdir in sorted(p for p in dataset.iterdir() if p.is_dir()):
        groups[gdir.name] = {}
        for f in sorted(gdir.glob("*.java")):
            sid = f"{gdir.name}/{f.stem}"
            groups[gdir.name][f.stem] = analyze_source(
                sid, f.read_text(encoding="utf-8"), k=k, window=window, timeout_s=0
            )
    return groups


def lex_only(s: SubmissionFingerprints) -> SubmissionFingerprints:
    """Bản chỉ có fingerprint 'lex' — để thấy giá trị của đường AST."""
    return SubmissionFingerprints(s.submission_id, lex=s.lex)


def build_pairs(groups) -> Tuple[List[tuple], List[tuple]]:
    """Trả về (cặp_dương, cặp_âm); mỗi cặp là (nhãn, a, b)."""
    positives, negatives = [], []
    for gname, files in groups.items():
        orig = files["original"]
        for stem, sub in files.items():
            if LEVEL_RE.match(stem):
                positives.append((f"{gname}:{stem}", orig, sub))
            elif stem.startswith("independent"):
                # Cùng đề, viết độc lập (có thể nhiều bản: independent, independent2, ...):
                # so với bài gốc VÀ với mọi biến thể đạo văn của nhóm (đều phải là "không giống").
                for other_stem, other in files.items():
                    if other_stem == stem:
                        continue
                    if other_stem.startswith("independent"):
                        if other_stem < stem:  # mỗi cặp độc lập~độc lập chỉ tính một lần
                            negatives.append((f"{gname}:{other_stem}~{stem}", other, sub))
                        continue
                    negatives.append((f"{gname}:{other_stem}~{stem}", other, sub))
    names = list(groups)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            for sa in groups[names[i]].values():
                for sb in groups[names[j]].values():
                    negatives.append((f"{names[i]}~{names[j]}", sa, sb))
    return positives, negatives


def rate(hits: int, total: int) -> str:
    return f"{hits}/{total} = {100.0 * hits / total:.0f}%" if total else "n/a"


def evaluate(groups, transform=lambda s: s):
    positives, negatives = build_pairs(groups)
    per_level: Dict[int, List[float]] = defaultdict(list)
    detail = []
    pos_warn = pos_danger = 0
    for label, a, b in positives:
        m = compare(transform(a), transform(b), with_fragments=False)
        level = int(LEVEL_RE.match(label.split(":")[1]).group(1))
        per_level[level].append(m.similarity_percent)
        pos_warn += m.level != LEVEL_SAFE
        pos_danger += m.level == LEVEL_DANGER
        detail.append((label, m.similarity_percent, m.level, m.mode))
    neg_warn = neg_danger = 0
    neg_detail = []
    for label, a, b in negatives:
        m = compare(transform(a), transform(b), with_fragments=False)
        neg_warn += m.level != LEVEL_SAFE
        neg_danger += m.level == LEVEL_DANGER
        neg_detail.append((label, m.similarity_percent, m.level))
    return dict(
        positives=len(positives), negatives=len(negatives),
        pos_warn=pos_warn, pos_danger=pos_danger, neg_warn=neg_warn, neg_danger=neg_danger,
        per_level=per_level, detail=detail, neg_detail=neg_detail,
    )


def report(dataset: Path, sweep: List[Tuple[int, int]]) -> str:
    out: List[str] = []
    k0, w0 = sweep[0]
    groups = load(dataset, k0, w0)
    ast_res = evaluate(groups)
    lex_res = evaluate(groups, lex_only)

    out.append(f"# Kết quả đo recall (k={k0}, window={w0})\n")
    out.append(f"Dataset: {len(groups)} nhóm — {ast_res['positives']} cặp ĐẠO VĂN, "
               f"{ast_res['negatives']} cặp KHÔNG đạo văn.\n")

    out.append("## 1. Similarity trung bình theo mức ngụy trang\n")
    out.append("| Mức | Kỹ thuật | AST+LEX (pipeline) | Chỉ LEX | Min (pipeline) |")
    out.append("|---|---|---|---|---|")
    names = {1: "đổi tên", 2: "+ comment, đổi literal", 3: "+ đảo thứ tự hàm",
             4: "AI viết lại (for→while, i++→i+=1, đảo if/else, tách hàm)",
             5: "AI viết lại mạnh (lambda, đệ quy, lớp phụ, code thừa)"}
    for lvl in sorted(ast_res["per_level"]):
        a, l = ast_res["per_level"][lvl], lex_res["per_level"][lvl]
        out.append(f"| L{lvl} | {names.get(lvl, '')} | {sum(a)/len(a):.0f}% | "
                   f"{sum(l)/len(l):.0f}% | {min(a):.0f}% |")

    out.append("\n## 2. Chi tiết từng cặp đạo văn (pipeline)\n")
    out.append("| Cặp | Similarity | Mức | Chế độ |")
    out.append("|---|---|---|---|")
    for label, sim, level, mode in ast_res["detail"]:
        out.append(f"| {label} | {sim:.0f}% | {level} | {mode} |")

    out.append("\n## 3. Tổng hợp\n")
    out.append("| | Pipeline (AST+LEX) | Chỉ LEX |")
    out.append("|---|---|---|")
    p, l = ast_res, lex_res
    out.append(f"| Recall mức DANGER (>60%) | {rate(p['pos_danger'], p['positives'])} | "
               f"{rate(l['pos_danger'], l['positives'])} |")
    out.append(f"| Recall mức WARNING+ (≥30%) | {rate(p['pos_warn'], p['positives'])} | "
               f"{rate(l['pos_warn'], l['positives'])} |")
    out.append(f"| Báo nhầm mức DANGER | {rate(p['neg_danger'], p['negatives'])} | "
               f"{rate(l['neg_danger'], l['negatives'])} |")
    out.append(f"| Báo nhầm mức WARNING+ | {rate(p['neg_warn'], p['negatives'])} | "
               f"{rate(l['neg_warn'], l['negatives'])} |")

    out.append("\n## 4. Các cặp KHÔNG đạo văn có điểm đáng chú ý (≥ 10%)\n")
    notable = [d for d in ast_res["neg_detail"] if d[1] >= 10.0]
    if notable:
        out.append("| Cặp | Similarity | Mức |")
        out.append("|---|---|---|")
        for label, sim, level in sorted(notable, key=lambda d: -d[1]):
            out.append(f"| {label} | {sim:.0f}% | {level} |")
    else:
        out.append("Không có cặp nào ≥ 10%.")

    if len(sweep) > 1:
        out.append("\n## 5. Quét tham số (k, window)\n")
        out.append("| k | window | ngưỡng đảm bảo (w+k-1) | Recall DANGER | Recall WARNING+ | "
                   "Báo nhầm DANGER | Báo nhầm WARNING+ | Recall L4 | Recall L5 |")
        out.append("|---|---|---|---|---|---|---|---|---|")
        for k, w in sweep:
            res = evaluate(load(dataset, k, w))
            lv = res["per_level"]
            r4 = sum(s > 60 for s in lv.get(4, [])), len(lv.get(4, []))
            r5 = sum(s > 60 for s in lv.get(5, [])), len(lv.get(5, []))
            out.append(
                f"| {k} | {w} | {w + k - 1} | {rate(res['pos_danger'], res['positives'])} | "
                f"{rate(res['pos_warn'], res['positives'])} | {rate(res['neg_danger'], res['negatives'])} | "
                f"{rate(res['neg_warn'], res['negatives'])} | {rate(*r4)} | {rate(*r5)} |"
            )
    out.append("\n## Giới hạn của phép đo (đọc trước khi trích số liệu)\n")
    out.append("- Mẫu NHỎ: số cặp đạo văn ít nên mỗi % thay đổi rất lớn; chưa đủ để kết luận thống kê.")
    out.append("- Biến thể L4/L5 do người viết tay mô phỏng cách AI ngụy trang, KHÔNG phải bài thật của đối thủ. "
               "Cần thay/bổ sung bằng biến thể AI sinh thật và bài nhóm khác nộp thử lúc P2P.")
    out.append("- Cặp ÂM chủ yếu là các chương trình khác đề (dễ). Chỉ có vài cặp 'cùng đề, viết độc lập' "
               "(khó) nên tỉ lệ báo nhầm ở đây đang bị đánh giá THẤP hơn thực tế.")
    out.append("- Recall tổng gộp cả L1-L3 (dễ) nên cao hơn recall trên riêng L4/L5; "
               "hãy xem bảng theo từng mức.")
    return "\n".join(out) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    ap.add_argument("--sweep", action="store_true", help="thử nhiều cặp (k, window)")
    ap.add_argument("--md", type=Path, help="ghi báo cáo ra file markdown")
    args = ap.parse_args()

    text = report(args.dataset, DEFAULT_SWEEP if args.sweep else DEFAULT_SWEEP[:1])
    print(text)
    if args.md:
        args.md.parent.mkdir(parents=True, exist_ok=True)
        args.md.write_text(text, encoding="utf-8")
        print(f"Đã ghi {args.md}")


if __name__ == "__main__":
    main()
