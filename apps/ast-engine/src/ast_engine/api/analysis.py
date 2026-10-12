"""Các endpoint của AST Engine: POST /analyze, POST /compare, POST /compare/batch.

Ý TƯỞNG (đọc trước khi đọc code)
================================
Engine KHÔNG đụng database (ADR-001). Nó chỉ nhận dữ liệu vào, trả kết quả ra;
api-gateway (Node/Prisma) chịu trách nhiệm lưu vào AST_FINGERPRINTS / PLAGIARISM_MATCHES.

    ① /analyze        source Java  ──▶ fingerprint (JSON)      gateway lưu → AST_FINGERPRINTS
    ② /compare        2 bài        ──▶ similarity + fragments  gateway lưu → PLAGIARISM_MATCHES
    ③ /compare/batch  cả lớp       ──▶ danh sách các cặp nghi vấn

Mỗi "bài" trong /compare và /compare/batch được cung cấp theo MỘT trong hai cách:
    - `fingerprint`: object lấy từ trường `fingerprint` của kết quả /analyze (nhanh, nên dùng).
    - `source_code` + `submission_id`: engine tự phân tích (tiện cho demo/P2P).

Hai ĐƯỜNG NGOẠI LỆ (exception path) chính của luồng phân tích:
    A. Bài có lỗi cú pháp   -> KHÔNG báo lỗi HTTP; trả 200, analysis_mode = "lex",
                               warnings có "SYNTAX_ERROR_FALLBACK_LEX" (không để kẻ đạo văn
                               thoát bằng cách làm hỏng cú pháp).
    A'. Parser/chuẩn hóa hỏng dù cú pháp ĐÚNG (vd. bài lồng quá sâu) -> như A nhưng cảnh báo là
                               "ANALYSIS_ERROR_FALLBACK_LEX"; `fallback_reason` cho biết lý do.
    A''. Parse quá thời gian cho phép (bài có thể được cố ý làm khó parser) -> cảnh báo
                               "PARSE_TIMEOUT_FALLBACK_LEX", fallback_reason = "PARSE_TIMEOUT".
    B. Bài quá ngắn (< k token) -> trả 200 kèm cảnh báo "INSUFFICIENT_DATA"; matcher sẽ
                               không kết luận (similarity 0) thay vì kết luận sai.
Ngoài ra là lỗi đầu vào thật sự (HTTP 4xx) với body: {"detail": {"code": ..., "message": ...}}.

Cách gắn vào app (trong main.py):
    from ast_engine.api.analysis import router as analysis_router
    app.include_router(analysis_router)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

from ast_engine.analyzer import analyze_source
from ast_engine.similarity.matcher import SubmissionFingerprints, compare, compare_all

router = APIRouter(tags=["ast-engine"])

# Giới hạn đầu vào (bài nộp là dữ liệu KHÔNG đáng tin: chặn kích thước để tránh làm treo parser).
# Đo thực tế: thời gian phân tích tăng gần tuyến tính, ~4 giây cho 40.000 ký tự input xấu nhất.
# Bài sinh viên thật hiếm khi vượt 30.000 ký tự nên 100.000 là đủ rộng mà vẫn chặn được DoS.
MAX_SOURCE_CHARS = 100_000
MAX_BATCH_SIZE = 500
# Phân tích source_code tốn CPU: trong /compare/batch chỉ cho phép ít bài gửi source_code
# (gửi `fingerprint` đã lưu thì không giới hạn kiểu này) để một request không giữ server hàng phút.
MAX_BATCH_SOURCE_ITEMS = 20
SUPPORTED_LANGUAGES = {"java"}  # MVP chỉ Java (Python/C# để sau)


# --------------------------------------------------------------------------- #
# Schema đầu vào
# --------------------------------------------------------------------------- #


class AnalyzeRequest(BaseModel):
    submission_id: str = Field(min_length=1, max_length=100)
    source_code: str = Field(min_length=1, max_length=MAX_SOURCE_CHARS)
    language: str = "java"


class SubmissionInput(BaseModel):
    """Một bài nộp trong /compare: đưa `fingerprint` HOẶC `source_code` (đúng một trong hai)."""

    submission_id: Optional[str] = Field(default=None, min_length=1, max_length=100)
    fingerprint: Optional[Dict[str, Any]] = None
    source_code: Optional[str] = Field(default=None, min_length=1, max_length=MAX_SOURCE_CHARS)

    @model_validator(mode="after")
    def _exactly_one_source(self) -> "SubmissionInput":
        if (self.fingerprint is None) == (self.source_code is None):
            raise ValueError("Phải cung cấp đúng MỘT trong `fingerprint` hoặc `source_code`")
        if self.source_code is not None and not self.submission_id:
            raise ValueError("`submission_id` là bắt buộc khi gửi `source_code`")
        return self


class CompareRequest(BaseModel):
    submission_1: SubmissionInput
    submission_2: SubmissionInput
    whitelist: Optional[List[int]] = None  # hash của code mẫu cần loại trừ (rủi ro R04)
    with_fragments: bool = True


class BatchCompareRequest(BaseModel):
    submissions: List[SubmissionInput] = Field(min_length=2, max_length=MAX_BATCH_SIZE)
    whitelist: Optional[List[int]] = None
    min_percent: float = Field(default=0.0, ge=0.0, le=100.0)
    with_fragments: bool = True


# --------------------------------------------------------------------------- #
# Hàm phụ trợ
# --------------------------------------------------------------------------- #


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def _resolve(item: SubmissionInput) -> SubmissionFingerprints:
    """Đổi một SubmissionInput thành SubmissionFingerprints (phân tích mới hoặc đọc lại)."""
    if item.fingerprint is not None:
        try:
            subs = SubmissionFingerprints.from_dict(item.fingerprint)
        except (KeyError, TypeError, ValueError, AttributeError) as exc:
            raise _error(422, "INVALID_FINGERPRINT", f"Fingerprint không hợp lệ: {exc!r}")
        if item.submission_id:
            subs.submission_id = item.submission_id
        return subs
    return analyze_source(item.submission_id or "", item.source_code or "")


def _check_same_params(subs: List[SubmissionFingerprints]) -> None:
    """So fingerprint tạo bằng k/window khác nhau là vô nghĩa -> từ chối."""
    params = {(s.lex.k, s.lex.window) for s in subs}
    for s in subs:
        if s.ast is not None:
            params.add((s.ast.k, s.ast.window))
    if len(params) > 1:
        raise _error(
            422,
            "FINGERPRINT_PARAMS_MISMATCH",
            f"Các fingerprint dùng tham số (k, window) khác nhau: {sorted(params)}",
        )


def _analysis_warnings(subs: SubmissionFingerprints) -> List[str]:
    warnings: List[str] = []
    if subs.fallback_reason == "SYNTAX_ERROR":
        warnings.append("SYNTAX_ERROR_FALLBACK_LEX")  # đường ngoại lệ A: bài có lỗi cú pháp
    elif subs.fallback_reason == "PARSE_TIMEOUT":
        warnings.append("PARSE_TIMEOUT_FALLBACK_LEX")  # bài làm parser quá chậm: nên để giảng viên xem
    elif subs.fallback_reason is not None:
        warnings.append("ANALYSIS_ERROR_FALLBACK_LEX")  # parser/chuẩn hóa hỏng dù cú pháp đúng
    if subs.lex.too_short:
        warnings.append("INSUFFICIENT_DATA")           # đường ngoại lệ B
    return warnings


# --------------------------------------------------------------------------- #
# Endpoint
# --------------------------------------------------------------------------- #
# Dùng `def` (không phải `async def`): phân tích là việc tốn CPU, FastAPI sẽ chạy nó
# trong thread pool nên không chặn event loop của server.


@router.post("/analyze")
def analyze(req: AnalyzeRequest) -> Dict[str, Any]:
    """Phân tích một bài nộp -> fingerprint để gateway lưu vào AST_FINGERPRINTS."""
    if req.language.lower() not in SUPPORTED_LANGUAGES:
        raise _error(
            400,
            "UNSUPPORTED_LANGUAGE",
            f"Chưa hỗ trợ ngôn ngữ '{req.language}'. Hiện chỉ hỗ trợ: {sorted(SUPPORTED_LANGUAGES)}",
        )
    result = analyze_source(req.submission_id, req.source_code)
    return {
        "submission_id": result.submission_id,
        "analysis_mode": "ast" if result.ast is not None else "lex",
        "parse_ok": result.parse_ok,
        "syntax_error_count": result.syntax_error_count,
        "fallback_reason": result.fallback_reason,
        "token_count": {
            "ast": result.ast.token_count if result.ast else None,
            "lex": result.lex.token_count,
        },
        "warnings": _analysis_warnings(result),
        "fingerprint": result.to_dict(),
    }


@router.post("/compare")
def compare_two(req: CompareRequest) -> Dict[str, Any]:
    """So khớp hai bài -> kết quả để gateway lưu vào PLAGIARISM_MATCHES."""
    a, b = _resolve(req.submission_1), _resolve(req.submission_2)
    _check_same_params([a, b])
    match = compare(
        a,
        b,
        whitelist=set(req.whitelist) if req.whitelist else None,
        with_fragments=req.with_fragments,
    )
    return match.to_dict()


@router.post("/compare/batch")
def compare_batch(req: BatchCompareRequest) -> Dict[str, Any]:
    """So khớp cả lớp: chỉ trả về các cặp có hash chung và đạt `min_percent`."""
    source_items = sum(1 for item in req.submissions if item.source_code is not None)
    if source_items > MAX_BATCH_SOURCE_ITEMS:
        raise _error(
            422,
            "TOO_MANY_SOURCE_ITEMS",
            f"Tối đa {MAX_BATCH_SOURCE_ITEMS} bài gửi source_code mỗi lần "
            f"(nhận {source_items}); hãy gọi /analyze trước rồi gửi `fingerprint`.",
        )
    subs = [_resolve(item) for item in req.submissions]

    ids = [s.submission_id for s in subs]
    duplicated = sorted({i for i in ids if ids.count(i) > 1})
    if duplicated:
        raise _error(422, "DUPLICATE_SUBMISSION_ID", f"submission_id bị trùng: {duplicated}")
    _check_same_params(subs)

    matches = compare_all(
        subs,
        whitelist=set(req.whitelist) if req.whitelist else None,
        min_percent=req.min_percent,
        with_fragments=req.with_fragments,
    )
    return {
        "submission_count": len(subs),
        "match_count": len(matches),
        "matches": [m.to_dict() for m in matches],
    }
