"""Giới hạn thời gian cho các bước phân tích tốn CPU.

Ý TƯỞNG (đọc trước khi đọc code)
================================
Bài nộp là dữ liệu KHÔNG đáng tin. Kẻ tấn công có thể gửi bài khiến parser ANTLR chạy
hàng chục giây (vd. ngoặc lồng hàng nghìn tầng) để giữ kẹt server. Ta cần một "đồng hồ bấm giờ":

    request ──▶ [luồng phụ chạy parse + chuẩn hóa] ──┐
                  │                                   │ đợi tối đa N giây
                  └── quá hạn? ──▶ ép luồng phụ dừng ─┴─▶ báo AnalysisTimeout

Python không có lệnh "giết một luồng", nhưng parser ANTLR viết bằng Python thuần nên luôn
đang thực thi bytecode. Ta dùng PyThreadState_SetAsyncExc để chèn một ngoại lệ vào luồng đó;
ngoại lệ được kích hoạt ngay ở lệnh bytecode kế tiếp.

Vì sao ngoại lệ nội bộ kế thừa BaseException (không phải Exception)?
  Nếu đâu đó trong parser có `except Exception:` thì ngoại lệ ngắt sẽ bị nuốt và luồng cứ chạy tiếp.
  Kế thừa BaseException để chúng không bắt nhầm.

Cách này KHÔNG cần sửa parse_java và chạy được trên Windows/Linux (khác với signal.alarm).

GIỚI HẠN ĐÃ BIẾT: chỉ ngắt được code Python. Nếu một luồng kẹt trong lệnh C kéo dài (vd. regex
thoái hóa) thì phải chờ lệnh đó xong. Bộ tách token regex của lexer_fallback đã được kiểm tra
tuyến tính trên các đầu vào xấu nên không rơi vào trường hợp này.
"""

from __future__ import annotations

import ctypes
import logging
import threading
from typing import Any, Callable, TypeVar

T = TypeVar("T")
_log = logging.getLogger(__name__)

# Thời gian chờ luồng phụ dừng hẳn sau khi đã chèn ngoại lệ ngắt.
_GRACE_SECONDS = 2.0


class AnalysisTimeout(Exception):
    """Phân tích vượt quá thời gian cho phép."""


class _Abort(BaseException):
    """Ngoại lệ nội bộ chèn vào luồng quá hạn (BaseException để không bị `except Exception` nuốt)."""


def run_with_timeout(fn: Callable[[], T], seconds: float) -> T:
    """Chạy fn() trong luồng phụ, tối đa `seconds` giây.

    - Xong đúng hạn: trả kết quả; nếu fn ném lỗi thì ném lại đúng lỗi đó cho người gọi.
    - Quá hạn: ép luồng dừng và ném AnalysisTimeout.
    seconds <= 0 hoặc None: không giới hạn (chạy thẳng, không tạo luồng).
    """
    if not seconds or seconds <= 0:
        return fn()

    box: dict = {}

    def target() -> None:
        try:
            box["value"] = fn()
        except _Abort:
            box["aborted"] = True
        except BaseException as exc:  # chuyển lỗi sang luồng gọi để ném lại cho đúng ngữ cảnh
            box["error"] = exc

    worker = threading.Thread(target=target, name="ast-analysis", daemon=True)
    worker.start()
    worker.join(seconds)

    if worker.is_alive():
        _abort_thread(worker)
        raise AnalysisTimeout(f"Phân tích vượt quá {seconds:g} giây")
    if "error" in box:
        raise box["error"]
    return box["value"]


def _abort_thread(worker: threading.Thread) -> None:
    ident: Any = worker.ident
    ctypes.pythonapi.PyThreadState_SetAsyncExc(ctypes.c_ulong(ident), ctypes.py_object(_Abort))
    worker.join(_GRACE_SECONDS)
    if worker.is_alive():  # hiếm: đang kẹt trong lệnh C. Luồng là daemon nên không cản server tắt.
        _log.warning("Luồng phân tích %s chưa dừng sau %.1fs kể từ khi bị ngắt", worker.name, _GRACE_SECONDS)
