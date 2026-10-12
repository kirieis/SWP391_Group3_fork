"""Winnowing — tạo "dấu vân tay" (fingerprint) cho một chuỗi token.

Ý TƯỞNG (đọc trước khi đọc code)
================================
Muốn biết hai bài nộp có giống nhau không, ta không so từng token (quá chậm, quá nhạy).
Thay vào đó Winnowing (Schleimer, Wilkerson, Aiken – SIGMOD 2003) làm 3 bước:

  Bước 1. Chia chuỗi token thành các "k-gram" (cụm k token liên tiếp) rồi băm mỗi cụm.

      tokens : [ A  B  C  D  E  F  G ... ]        (k = 3 cho dễ vẽ)
      k-gram :  ABC BCD CDE DEF EFG ...
      hash   :  h0  h1  h2  h3  h4  ...

  Bước 2. Trượt một cửa sổ w hash liên tiếp; MỖI cửa sổ chỉ giữ hash NHỎ NHẤT
          (nếu trùng giá trị -> lấy vị trí BÊN PHẢI nhất).

      hash   :  [ 7  3  9  3  8 ] 5  2 ...          (w = 5)
                  cửa sổ 1 -> min = 3, lấy vị trí phải nhất (index 3)
                   [ 3  9  3  8  5 ] 2 ...
                  cửa sổ 2 -> min = 3 (vẫn index 3) -> đã chọn rồi, KHÔNG ghi lại

  Bước 3. Tập các (hash, vị trí) đã chọn chính là fingerprint.

VÌ SAO HIỆU QUẢ?
  * Fingerprint nhỏ hơn nhiều so với toàn bộ k-gram (chỉ ~ 2/(w+1) số hash được giữ).
  * BẢO ĐẢM: nếu hai chuỗi có chung một đoạn dài >= w + k - 1 token thì chắc chắn
    ít nhất 1 hash trùng nhau được chọn ở cả hai fingerprint.
    Với (k, w) mặc định = (15, 25)  ->  ngưỡng đảm bảo = 39 token (SRS v1.2 ghi 25/40 -> 64).

Module này KHÔNG phụ thuộc ANTLR: đầu vào chỉ là danh sách chuỗi (token).
"""

from __future__ import annotations

import hashlib
from collections import deque
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Set, Tuple

from ast_engine.config import WINNOWING  # noqa: E402  (MỘT nguồn sự thật: config.py)

DEFAULT_K = WINNOWING.k
DEFAULT_WINDOW = WINNOWING.window

# Hash rolling tính trên modulo số nguyên tố Mersenne 2^61 - 1.
_MOD = (1 << 61) - 1
_BASE = 1_000_003
# Cắt hash còn 52 bit: JSON/JavaScript (api-gateway Node) chỉ biểu diễn chính xác
# số nguyên tới 2^53 - 1, nên hash lớn hơn sẽ bị làm tròn khi gateway đọc.
_MASK_52 = (1 << 52) - 1

_token_hash_cache: Dict[str, int] = {}


def _token_hash(token: str) -> int:
    """Hash cố định (KHÔNG dùng hash() của Python vì nó đổi mỗi lần chạy process)."""
    cached = _token_hash_cache.get(token)
    if cached is None:
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
        cached = int.from_bytes(digest, "big") % _MOD
        _token_hash_cache[token] = cached
    return cached


def kgram_hashes(tokens: Sequence[str], k: int = DEFAULT_K) -> List[int]:
    """Băm mọi k-gram bằng rolling hash (Rabin–Karp) — O(n).

    Kết quả có n - k + 1 phần tử; hash[i] ứng với k-gram bắt đầu tại token i.
    Trả về [] nếu chuỗi ngắn hơn k.
    """
    n = len(tokens)
    if k <= 0 or n < k:
        return []

    token_hashes = [_token_hash(t) for t in tokens]
    pow_k1 = pow(_BASE, k - 1, _MOD)  # _BASE^(k-1), dùng để "bỏ" token đầu khỏi cửa sổ

    h = 0
    for i in range(k):
        h = (h * _BASE + token_hashes[i]) % _MOD
    result = [h & _MASK_52]

    for i in range(k, n):
        h = (h - token_hashes[i - k] * pow_k1) % _MOD  # bỏ token cũ nhất
        h = (h * _BASE + token_hashes[i]) % _MOD       # thêm token mới
        result.append(h & _MASK_52)
    return result


def winnow(hashes: Sequence[int], window: int = DEFAULT_WINDOW) -> List[Tuple[int, int]]:
    """Chọn hash nhỏ nhất (tie -> vị trí phải nhất) trong mỗi cửa sổ. O(n).

    Dùng hàng đợi đơn điệu (deque): các index trong deque có hash TĂNG dần,
    nên phần tử đầu deque luôn là min của cửa sổ hiện tại.
    Trả về danh sách (hash, vị_trí_k-gram) theo thứ tự vị trí tăng dần.
    """
    if not hashes:
        return []
    window = max(1, min(window, len(hashes)))  # chuỗi ngắn: 1 cửa sổ bao trùm tất cả

    selected: List[Tuple[int, int]] = []
    dq: "deque[int]" = deque()
    last_pos = -1

    for i, h in enumerate(hashes):
        # ">=" (không phải ">") để hash bằng nhau thì phần tử MỚI (bên phải) thắng.
        while dq and hashes[dq[-1]] >= h:
            dq.pop()
        dq.append(i)
        if dq[0] <= i - window:  # phần tử đầu đã trượt ra khỏi cửa sổ
            dq.popleft()
        if i >= window - 1:
            m = dq[0]
            if m != last_pos:  # cùng một hash được chọn ở nhiều cửa sổ -> chỉ ghi 1 lần
                selected.append((hashes[m], m))
                last_pos = m
    return selected


@dataclass
class Fingerprint:
    """Dấu vân tay của một bài nộp ở một "chế độ" (mode) chuẩn hóa.

    mode: "ast" (chuẩn hóa từ parse tree) hoặc "lex" (dự phòng từ lexer).
    entries: danh sách (hash, vị_trí_k-gram) — vị trí tính theo chỉ số token.
    token_lines: dòng nguồn của từng token, dùng để đổi vị trí -> số dòng khi báo cáo.
    """

    mode: str
    k: int
    window: int
    token_count: int
    entries: List[Tuple[int, int]] = field(default_factory=list)
    token_lines: List[int] = field(default_factory=list)

    @property
    def too_short(self) -> bool:
        """Bài quá ngắn (< k token) -> không đủ dữ liệu để so sánh đáng tin."""
        return self.token_count < self.k

    @property
    def hash_set(self) -> Set[int]:
        return {h for h, _ in self.entries}

    def to_dict(self) -> dict:
        """Dạng JSON để api-gateway lưu vào AST_FINGERPRINTS.fingerprint_data."""
        return {
            "mode": self.mode,
            "k": self.k,
            "window": self.window,
            "token_count": self.token_count,
            "entries": [[h, p] for h, p in self.entries],
            "token_lines": list(self.token_lines),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Fingerprint":
        return cls(
            mode=data["mode"],
            k=int(data["k"]),
            window=int(data["window"]),
            token_count=int(data["token_count"]),
            entries=[(int(h), int(p)) for h, p in data["entries"]],
            token_lines=[int(x) for x in data.get("token_lines", [])],
        )


def build_fingerprint(
    tokens: Sequence[str],
    lines: Optional[Sequence[int]] = None,
    *,
    mode: str = "ast",
    k: int = DEFAULT_K,
    window: int = DEFAULT_WINDOW,
) -> Fingerprint:
    """Tiện ích: tokens -> k-gram hash -> winnowing -> Fingerprint."""
    entries = winnow(kgram_hashes(tokens, k), window)
    return Fingerprint(
        mode=mode,
        k=k,
        window=window,
        token_count=len(tokens),
        entries=entries,
        token_lines=list(lines) if lines is not None else [],
    )
