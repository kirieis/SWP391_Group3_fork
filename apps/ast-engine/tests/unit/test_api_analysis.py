"""Test cho api/analysis.py — gọi endpoint qua TestClient (không cần chạy server)."""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ast_engine.api.analysis import MAX_SOURCE_CHARS, router
from tests.helpers import read_fixture

# App riêng cho test: không phụ thuộc main.py nên test không vỡ khi main.py thay đổi.
_app = FastAPI()
_app.include_router(router)
client = TestClient(_app)


def analyze(sid: str, name: str) -> dict:
    r = client.post("/analyze", json={"submission_id": sid, "source_code": read_fixture(name)})
    assert r.status_code == 200, r.text
    return r.json()


# --- /analyze: luồng chính ---------------------------------------------------


def test_analyze_luong_chinh():
    data = analyze("s1", "base_sorting.java")
    assert data["analysis_mode"] == "ast" and data["parse_ok"] is True
    assert data["syntax_error_count"] == 0 and data["warnings"] == []
    fp = data["fingerprint"]
    assert fp["ast"] is not None and fp["lex"] is not None


def test_hash_an_toan_cho_javascript():
    """Gateway Node đọc JSON: số nguyên > 2^53 sẽ bị làm tròn -> hash phải nhỏ hơn."""
    data = analyze("s1", "base_sorting.java")
    for part in ("ast", "lex"):
        assert all(h < 2**53 for h, _ in data["fingerprint"][part]["entries"])


# --- /analyze: đường ngoại lệ ------------------------------------------------


def test_ngoai_le_A_loi_cu_phap_roi_ve_lex_khong_bao_loi_http():
    broken = read_fixture("base_sorting.java") + "\n int int int ;;; {{{ @@@"
    r = client.post("/analyze", json={"submission_id": "bad", "source_code": broken})
    assert r.status_code == 200
    data = r.json()
    assert data["analysis_mode"] == "lex" and data["parse_ok"] is False
    assert data["syntax_error_count"] > 0
    assert "SYNTAX_ERROR_FALLBACK_LEX" in data["warnings"]
    assert data["fingerprint"]["ast"] is None and data["fingerprint"]["lex"] is not None


def test_ngoai_le_B_bai_qua_ngan_co_canh_bao():
    r = client.post("/analyze", json={"submission_id": "tiny", "source_code": "class A { }"})
    assert r.status_code == 200
    assert "INSUFFICIENT_DATA" in r.json()["warnings"]


def test_ngon_ngu_chua_ho_tro_tra_400():
    r = client.post(
        "/analyze", json={"submission_id": "p", "source_code": "print(1)", "language": "python"}
    )
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "UNSUPPORTED_LANGUAGE"


@pytest.mark.parametrize(
    "payload",
    [
        {"submission_id": "x", "source_code": ""},
        {"submission_id": "", "source_code": "class A {}"},
        {"source_code": "class A {}"},
        {"submission_id": "x", "source_code": "a" * (MAX_SOURCE_CHARS + 1)},
    ],
)
def test_dau_vao_khong_hop_le_tra_422(payload):
    assert client.post("/analyze", json=payload).status_code == 422


def test_long_ngoac_cuc_sau_khong_lam_sap_server():
    nested = "class A { int x = " + "(" * 600 + "1" + ")" * 600 + "; }"
    r = client.post("/analyze", json={"submission_id": "deep", "source_code": nested})
    assert r.status_code == 200
    assert r.json()["fingerprint"]["lex"] is not None


# --- /compare ----------------------------------------------------------------


def test_compare_bang_fingerprint_qua_vong_json():
    """Mô phỏng gateway: lưu fingerprint ra JSON rồi gửi lại -> kết quả y như so trực tiếp."""
    fa = json.loads(json.dumps(analyze("a", "base_sorting.java")["fingerprint"]))
    fb = json.loads(json.dumps(analyze("b", "variant_l3_reorder.java")["fingerprint"]))
    r = client.post("/compare", json={"submission_1": {"fingerprint": fa}, "submission_2": {"fingerprint": fb}})
    assert r.status_code == 200
    m = r.json()
    assert m["mode"] == "ast" and m["similarity_percent"] > 80
    assert m["level"] == "DANGER" and m["flag"] == "PLAGIARISM_DETECTED"
    assert (m["submission_1_id"], m["submission_2_id"]) == ("a", "b")
    assert m["matched_fragments"] and "a_lines" in m["matched_fragments"][0]


def test_compare_bang_source_code():
    body = {
        "submission_1": {"submission_id": "a", "source_code": read_fixture("base_sorting.java")},
        "submission_2": {"submission_id": "b", "source_code": read_fixture("variant_l1_rename.java")},
    }
    r = client.post("/compare", json=body)
    assert r.status_code == 200 and r.json()["similarity_percent"] == 100.0


def test_compare_bai_khong_lien_quan_la_safe():
    body = {
        "submission_1": {"submission_id": "a", "source_code": read_fixture("base_sorting.java")},
        "submission_2": {"submission_id": "b", "source_code": read_fixture("unrelated_linkedlist.java")},
    }
    m = client.post("/compare", json=body).json()
    assert m["level"] == "SAFE" and m["flag"] is None


def test_compare_whitelist_loai_code_mau():
    fa = analyze("a", "base_sorting.java")["fingerprint"]
    fb = analyze("b", "variant_l1_rename.java")["fingerprint"]
    template = [h for h, _ in fa["ast"]["entries"]]
    body = {"submission_1": {"fingerprint": fa}, "submission_2": {"fingerprint": fb}, "whitelist": template}
    m = client.post("/compare", json=body).json()
    assert m["similarity_percent"] == 0.0 and m["note"] == "INSUFFICIENT_DATA"


def test_compare_fingerprint_hong_tra_422():
    body = {"submission_1": {"fingerprint": {"linh": "tinh"}},
            "submission_2": {"submission_id": "b", "source_code": "class A {}"}}
    r = client.post("/compare", json=body)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "INVALID_FINGERPRINT"


def test_compare_gui_ca_hai_cach_tra_422():
    fp = analyze("a", "base_sorting.java")["fingerprint"]
    body = {"submission_1": {"submission_id": "a", "fingerprint": fp, "source_code": "class A {}"},
            "submission_2": {"fingerprint": fp}}
    assert client.post("/compare", json=body).status_code == 422


def test_compare_thieu_ca_hai_tra_422():
    body = {"submission_1": {"submission_id": "a"}, "submission_2": {"submission_id": "b"}}
    assert client.post("/compare", json=body).status_code == 422


def test_compare_source_code_thieu_id_tra_422():
    body = {"submission_1": {"source_code": "class A {}"}, "submission_2": {"source_code": "class B {}"}}
    assert client.post("/compare", json=body).status_code == 422


def test_compare_tham_so_k_window_khac_nhau_tra_422():
    fa = analyze("a", "base_sorting.java")["fingerprint"]
    fb = analyze("b", "base_sorting.java")["fingerprint"]
    fb["lex"]["k"] = 10
    body = {"submission_1": {"fingerprint": fa}, "submission_2": {"fingerprint": fb}}
    r = client.post("/compare", json=body)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "FINGERPRINT_PARAMS_MISMATCH"


# --- /compare/batch ----------------------------------------------------------


def _batch_items():
    names = {"base": "base_sorting.java", "v1": "variant_l1_rename.java",
             "v3": "variant_l3_reorder.java", "other": "unrelated_linkedlist.java"}
    return [{"fingerprint": analyze(sid, n)["fingerprint"]} for sid, n in names.items()]


def test_batch_tim_dung_cap_nghi_van():
    r = client.post("/compare/batch", json={"submissions": _batch_items(), "min_percent": 30})
    assert r.status_code == 200
    data = r.json()
    assert data["submission_count"] == 4 and data["match_count"] == len(data["matches"])
    pairs = {frozenset((m["submission_1_id"], m["submission_2_id"])) for m in data["matches"]}
    assert frozenset(("base", "v1")) in pairs and frozenset(("base", "v3")) in pairs
    assert all("other" not in p for p in pairs)


def test_batch_id_trung_tra_422():
    items = _batch_items()
    items[1]["fingerprint"]["submission_id"] = "base"
    r = client.post("/compare/batch", json={"submissions": items})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "DUPLICATE_SUBMISSION_ID"


def test_batch_it_hon_2_bai_tra_422():
    assert client.post("/compare/batch", json={"submissions": _batch_items()[:1]}).status_code == 422


# --- Chống tấn công / lý do fallback ------------------------------------------------


def test_analyze_tra_ve_fallback_reason_cho_loi_cu_phap():
    broken = read_fixture("base_sorting.java") + "\n int int int ;;; {{{ @@@"
    data = client.post("/analyze", json={"submission_id": "b", "source_code": broken}).json()
    assert data["fallback_reason"] == "SYNTAX_ERROR"
    assert "SYNTAX_ERROR_FALLBACK_LEX" in data["warnings"]


def test_analyze_bai_sach_fallback_reason_la_null():
    assert analyze("s", "base_sorting.java")["fallback_reason"] is None


def test_parser_hong_bat_ngo_khong_bi_goi_nham_la_loi_cu_phap(monkeypatch):
    import ast_engine.analyzer as az

    def boom(_source):
        raise RecursionError("parser sập")

    monkeypatch.setattr(az, "_run_parser", boom)
    r = client.post("/analyze", json={"submission_id": "x", "source_code": read_fixture("base_sorting.java")})
    data = r.json()
    assert r.status_code == 200 and data["analysis_mode"] == "lex"
    assert data["fallback_reason"] == "PARSER_FAILED"
    assert data["syntax_error_count"] == 0
    assert "ANALYSIS_ERROR_FALLBACK_LEX" in data["warnings"]
    assert "SYNTAX_ERROR_FALLBACK_LEX" not in data["warnings"]


def test_bieu_thuc_cuc_dai_van_ra_che_do_ast():
    src = "class A { int f(int a) { return " + " + ".join(["a"] * 3000) + "; } }"
    data = client.post("/analyze", json={"submission_id": "long", "source_code": src}).json()
    assert data["analysis_mode"] == "ast" and data["fallback_reason"] is None


def test_batch_qua_nhieu_bai_gui_source_code_tra_422():
    items = [{"submission_id": f"s{i}", "source_code": "class A { }"} for i in range(21)]
    r = client.post("/compare/batch", json={"submissions": items})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "TOO_MANY_SOURCE_ITEMS"


def test_batch_gui_fingerprint_khong_bi_gioi_han_kieu_source_code():
    fp = analyze("base", "base_sorting.java")["fingerprint"]
    items = []
    for i in range(30):
        f = json.loads(json.dumps(fp))
        f["submission_id"] = f"s{i}"
        items.append({"fingerprint": f})
    r = client.post("/compare/batch", json={"submissions": items, "with_fragments": False})
    assert r.status_code == 200 and r.json()["submission_count"] == 30


# --- Timeout -------------------------------------------------------------------------


def test_api_parse_timeout_tra_200_kem_canh_bao_rieng(monkeypatch):
    import ast_engine.analyzer as az

    def slow(_source):
        while True:
            pass

    monkeypatch.setattr(az, "_run_parser", slow)
    monkeypatch.setattr(az, "DEFAULT_TIMEOUT_SECONDS", 0.3)
    r = client.post("/analyze", json={"submission_id": "slow", "source_code": read_fixture("base_sorting.java")})
    data = r.json()
    assert r.status_code == 200 and data["analysis_mode"] == "lex"
    assert data["fallback_reason"] == "PARSE_TIMEOUT"
    assert "PARSE_TIMEOUT_FALLBACK_LEX" in data["warnings"]
    assert "SYNTAX_ERROR_FALLBACK_LEX" not in data["warnings"]
