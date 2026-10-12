"""Điểm nối các module: source Java -> SubmissionFingerprints.

Luồng xử lý (endpoint POST /analyze sẽ gọi hàm `analyze_source`):

    source ─┬─▶ lexer_fallback ─▶ Winnowing ─▶ fingerprint "lex"   (LUÔN tính)
            │
            └─▶ parse_java ──┬─ 0 lỗi cú pháp ─▶ tree_normalizer ─▶ Winnowing ─▶ fingerprint "ast"
                             └─ có lỗi / exception ─▶ ast = None  (matcher sẽ dùng "lex")
                                lý do ghi vào `fallback_reason`: SYNTAX_ERROR | PARSER_FAILED
                                                                 | NORMALIZATION_FAILED | PARSE_TIMEOUT

Chính sách: chỉ tin fingerprint "ast" khi parse KHÔNG có lỗi nào. Nếu cho qua cây đã được
ANTLR "sửa lỗi", kẻ đạo văn có thể cố ý chèn cú pháp hỏng để cây bị cắt cụt, làm tụt điểm giống nhau.

Hợp đồng với parse_java (xem parsing/parse_java.py): trả về ParseResult có `.tree` và
`.issues` (danh sách SyntaxIssue). Số lỗi cú pháp = len(issues). Nếu parse_java đổi chữ ký,
`_unpack_parse_result` sẽ BÁO LỖI RÕ RÀNG (ParseContractError) thay vì lặng lẽ coi là "0 lỗi".
"""

from __future__ import annotations

import os
from typing import Any, Callable, Optional, Tuple

from ast_engine.fingerprint.winnowing import (
    DEFAULT_K,
    DEFAULT_WINDOW,
    Fingerprint,
    build_fingerprint,
)
from ast_engine.normalization.lexer_fallback import tokenize_fallback
from ast_engine.normalization.tree_normalizer import normalize_tree_with_lines
from ast_engine.safety import AnalysisTimeout, run_with_timeout
from ast_engine.similarity.matcher import SubmissionFingerprints

# Ngân sách thời gian cho đường AST (parse + chuẩn hóa + fingerprint) của MỘT bài.
# Bài bình thường mất ~0.1-0.5 giây; 5 giây đủ rộng cho bài lớn mà vẫn chặn được bài độc hại.
# Đặt biến môi trường AST_ANALYSIS_TIMEOUT_SECONDS để đổi (0 = không giới hạn).
DEFAULT_TIMEOUT_SECONDS = float(os.environ.get("AST_ANALYSIS_TIMEOUT_SECONDS", "5.0"))


class ParseContractError(TypeError):
    """parse_java trả về kiểu không đúng hợp đồng (thiếu .tree / .issues)."""


def _unpack_parse_result(result: Any) -> Tuple[Any, int]:
    """Đưa kết quả parse_java về dạng (tree, số_lỗi_cú_pháp).

    Hợp đồng thật: object có `.tree` và `.issues` (list[SyntaxIssue]).
    Cũng chấp nhận `.errors` hoặc tuple (tree, errors) để dễ viết test.
    KHÔNG có giá trị mặc định: thiếu thông tin lỗi mà vẫn coi là "0 lỗi" sẽ khiến
    bài hỏng bị tin nhầm là bài sạch — đúng điều chính sách của analyzer cấm.
    """
    if hasattr(result, "tree"):
        tree = result.tree
        if hasattr(result, "issues"):
            errors = result.issues
        elif hasattr(result, "errors"):
            errors = result.errors
        else:
            raise ParseContractError(
                f"{type(result).__name__} có .tree nhưng không có .issues/.errors"
            )
    elif isinstance(result, tuple) and len(result) == 2:
        tree, errors = result
    else:
        raise ParseContractError(f"Không hiểu kết quả parse_java: {type(result).__name__}")

    if hasattr(errors, "__len__"):
        return tree, len(errors)
    if isinstance(errors, int):
        return tree, errors
    raise ParseContractError(f"Không đếm được lỗi cú pháp từ: {type(errors).__name__}")


def _run_parser(source: str) -> Tuple[Any, int]:
    from ast_engine.parsing import parse_java  # import muộn để module này test được độc lập

    return _unpack_parse_result(parse_java(source))


def _build_ast_fingerprint(
    source: str,
    parse_fn: Optional[Callable[[str], Tuple[Any, int]]],
    k: int,
    window: int,
) -> Tuple[Optional[Fingerprint], int, Optional[str]]:
    """Đường AST: parse -> chuẩn hóa -> fingerprint. Trả về (fingerprint, số_lỗi, lý_do_fallback)."""
    # Bước 1: parse. Lỗi bất ngờ của parser (vd. RecursionError với bài lồng quá sâu) -> "lex".
    try:
        tree, error_count = (parse_fn or _run_parser)(source)
    except ParseContractError:  # lỗi lập trình/hợp đồng: phải lộ ra, không được nuốt
        raise
    except Exception:
        return None, 0, "PARSER_FAILED"

    if tree is None or error_count > 0:
        return None, error_count, "SYNTAX_ERROR"

    # Bước 2: chuẩn hóa + fingerprint. Tách riêng để biết chính xác bước nào hỏng.
    try:
        tokens = normalize_tree_with_lines(tree)
        fp = build_fingerprint(
            [t.value for t in tokens],
            [t.line for t in tokens],
            mode="ast",
            k=k,
            window=window,
        )
        return fp, 0, None
    except Exception:
        return None, 0, "NORMALIZATION_FAILED"


def analyze_source(
    submission_id: str,
    source: str,
    *,
    k: int = DEFAULT_K,
    window: int = DEFAULT_WINDOW,
    parse_fn: Optional[Callable[[str], Tuple[Any, int]]] = None,
    timeout_s: Optional[float] = None,
) -> SubmissionFingerprints:
    """Tạo bộ fingerprint ("lex" luôn có, "ast" khi parse sạch và kịp thời gian) cho một bài nộp.

    timeout_s: ngân sách thời gian cho đường AST; None -> DEFAULT_TIMEOUT_SECONDS; 0 -> không giới hạn.
    Quá hạn -> bỏ "ast", ghi fallback_reason = "PARSE_TIMEOUT" (bài đáng để giảng viên xem lại).
    """
    lex_tokens = tokenize_fallback(source)  # luôn chạy, tuyến tính, không bao giờ ném lỗi cú pháp
    lex_fp = build_fingerprint(
        [t.value for t in lex_tokens],
        [t.line for t in lex_tokens],
        mode="lex",
        k=k,
        window=window,
    )

    budget = DEFAULT_TIMEOUT_SECONDS if timeout_s is None else timeout_s
    try:
        ast_fp, error_count, reason = run_with_timeout(
            lambda: _build_ast_fingerprint(source, parse_fn, k, window), budget
        )
    except AnalysisTimeout:
        ast_fp, error_count, reason = None, 0, "PARSE_TIMEOUT"

    return SubmissionFingerprints(
        submission_id=submission_id,
        lex=lex_fp,
        ast=ast_fp,
        parse_ok=ast_fp is not None,
        syntax_error_count=error_count,
        fallback_reason=reason,
    )
