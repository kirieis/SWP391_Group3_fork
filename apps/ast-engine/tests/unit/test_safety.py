"""Test cho safety.py (giới hạn thời gian) và việc analyzer dùng nó."""

import threading
import time

import pytest

import ast_engine.analyzer as az
from ast_engine.analyzer import ParseContractError, analyze_source
from ast_engine.safety import AnalysisTimeout, run_with_timeout
from tests.helpers import read_fixture


def _busy_forever():
    """Vòng lặp Python thuần vô tận — mô phỏng parser bị làm kẹt."""
    x = 0
    while True:
        x += 1


def test_chay_xong_dung_han_tra_ket_qua():
    assert run_with_timeout(lambda: 21 * 2, 2.0) == 42


def test_loi_cua_ham_duoc_nem_lai_nguyen_ven():
    def boom():
        raise ValueError("hỏng")

    with pytest.raises(ValueError, match="hỏng"):
        run_with_timeout(boom, 2.0)


def test_qua_han_thi_ngat_duoc_vong_lap_vo_tan():
    t0 = time.time()
    with pytest.raises(AnalysisTimeout):
        run_with_timeout(_busy_forever, 0.3)
    assert time.time() - t0 < 2.5


def test_ngat_xong_khong_ro_luong():
    before = threading.active_count()
    for _ in range(3):
        with pytest.raises(AnalysisTimeout):
            run_with_timeout(_busy_forever, 0.2)
    time.sleep(0.3)
    assert threading.active_count() == before


def test_ngat_duoc_ca_khi_ham_co_except_exception_nuot_loi():
    """Ngoại lệ ngắt kế thừa BaseException nên `except Exception` không nuốt được."""

    def swallow():
        while True:
            try:
                while True:
                    pass
            except Exception:
                pass

    with pytest.raises(AnalysisTimeout):
        run_with_timeout(swallow, 0.3)


def test_timeout_khong_dat_thi_khong_gioi_han():
    assert run_with_timeout(lambda: "ok", 0) == "ok"
    assert run_with_timeout(lambda: "ok", None) == "ok"


# --- Tích hợp với analyze_source ---------------------------------------------------


def test_analyzer_bai_binh_thuong_khong_bi_timeout():
    r = analyze_source("x", read_fixture("base_sorting.java"), timeout_s=5.0)
    assert r.ast is not None and r.fallback_reason is None


def test_analyzer_parser_cham_thi_roi_ve_lex_voi_ly_do_PARSE_TIMEOUT():
    t0 = time.time()
    r = analyze_source(
        "x", read_fixture("base_sorting.java"), parse_fn=lambda s: _busy_forever(), timeout_s=0.3
    )
    assert time.time() - t0 < 2.5
    assert r.fallback_reason == "PARSE_TIMEOUT" and r.ast is None and not r.parse_ok
    assert r.lex is not None and r.syntax_error_count == 0


def test_analyzer_ngat_duoc_parser_antlr_that_tren_bai_doc_hai():
    bad = "class A { int x = " + "(" * 3000 + "1" + ")" * 3000 + "; }"
    t0 = time.time()
    r = analyze_source("x", bad, timeout_s=0.5)
    assert time.time() - t0 < 3.0
    assert r.fallback_reason == "PARSE_TIMEOUT" and r.lex is not None


def test_analyzer_doc_timeout_mac_dinh_tu_module(monkeypatch):
    monkeypatch.setattr(az, "DEFAULT_TIMEOUT_SECONDS", 0.2)
    r = analyze_source("x", read_fixture("base_sorting.java"), parse_fn=lambda s: _busy_forever())
    assert r.fallback_reason == "PARSE_TIMEOUT"


def test_loi_hop_dong_van_lo_ra_khi_chay_trong_luong_timeout():
    class Bad:
        tree = "T"  # có .tree nhưng không có .issues/.errors

    with pytest.raises(ParseContractError):
        analyze_source("x", "class A { }", parse_fn=lambda s: az._unpack_parse_result(Bad()), timeout_s=2.0)
