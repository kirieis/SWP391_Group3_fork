"""Test cho similarity/matcher.py và analyzer.py (đường ống đầy đủ trên fixture thật)."""

import pytest

from ast_engine.analyzer import analyze_source
from ast_engine.similarity.matcher import (
    LEVEL_DANGER,
    LEVEL_SAFE,
    LEVEL_WARNING,
    SubmissionFingerprints,
    classify,
    compare,
    compare_all,
)
from tests.helpers import read_fixture


def sub(sid: str, name: str) -> SubmissionFingerprints:
    return analyze_source(sid, read_fixture(name))


@pytest.fixture(scope="module")
def base():
    return sub("base", "base_sorting.java")


@pytest.mark.parametrize(
    "pct,level",
    [(0, LEVEL_SAFE), (29.99, LEVEL_SAFE), (30, LEVEL_WARNING), (60, LEVEL_WARNING),
     (60.01, LEVEL_DANGER), (100, LEVEL_DANGER)],
)
def test_classify_bien_gioi(pct, level):
    assert classify(pct) == level


def test_bai_parse_sach_co_ca_ast_va_lex(base):
    assert base.parse_ok and base.ast is not None and base.lex is not None
    assert base.syntax_error_count == 0


def test_giong_het_100_phan_tram(base):
    m = compare(base, sub("copy", "base_sorting.java"))
    assert m.mode == "ast" and m.similarity_percent == 100.0
    assert m.level == LEVEL_DANGER and m.flag == "PLAGIARISM_DETECTED"


@pytest.mark.parametrize(
    "name",
    ["variant_l1_rename.java", "variant_l2_comments.java", "variant_l3_reorder.java"],
)
def test_ba_muc_nguy_trang_deu_bi_phat_hien(base, name):
    m = compare(base, sub("v", name))
    assert m.mode == "ast"
    assert m.similarity_percent > 80.0, f"{name}: {m.similarity_percent}"
    assert m.level == LEVEL_DANGER


def test_bai_khong_lien_quan_la_safe(base):
    m = compare(base, sub("other", "unrelated_linkedlist.java"))
    assert m.level == LEVEL_SAFE and m.flag is None


def test_dao_ham_bi_chan_o_che_do_ast_nhung_lex_thi_yeu_hon(base):
    """Chứng minh vì sao cần cả hai chế độ: đảo hàm chỉ 'lex' thì tụt điểm."""
    v3 = sub("v3", "variant_l3_reorder.java")
    ast_pct = compare(base, v3).similarity_percent
    lex_only_a = SubmissionFingerprints("a", lex=base.lex)
    lex_only_b = SubmissionFingerprints("b", lex=v3.lex)
    lex_m = compare(lex_only_a, lex_only_b)
    assert lex_m.mode == "lex"
    assert ast_pct > lex_m.similarity_percent


def test_bai_parse_loi_roi_ve_che_do_lex_van_bat_duoc_doi_ten():
    src = read_fixture("base_sorting.java")
    broken = read_fixture("variant_l2_comments.java") + "\n int int int ;;; {{{ @@@"
    a, b = analyze_source("a", src), analyze_source("b", broken)
    assert b.ast is None and not b.parse_ok and b.syntax_error_count > 0
    m = compare(a, b)
    assert m.mode == "lex" and m.similarity_percent > 60.0


def test_bai_qua_ngan_khong_ket_luan():
    a, b = analyze_source("a", "class A { }"), analyze_source("b", "class A { }")
    m = compare(a, b)
    assert m.similarity_percent == 0.0 and m.note == "INSUFFICIENT_DATA"


def test_whitelist_loai_code_mau(base):
    other = sub("v1", "variant_l1_rename.java")
    template = base.ast.hash_set  # giảng viên whitelist toàn bộ code mẫu này
    m = compare(base, other, whitelist=template)
    assert m.similarity_percent == 0.0 and m.note == "INSUFFICIENT_DATA"


def test_matched_fragments_tro_dung_dong(base):
    m = compare(base, sub("v1", "variant_l1_rename.java"))
    assert m.matched_fragments
    total = len(read_fixture("base_sorting.java").splitlines())
    for f in m.matched_fragments:
        assert 1 <= f.a_start <= f.a_end <= total
        assert 1 <= f.b_start <= f.b_end
    # hàm bubbleSort (bắt đầu ~dòng 12) phải nằm trong vùng trùng
    assert any(f.a_start <= 15 <= f.a_end for f in m.matched_fragments)


def test_compare_all_chi_so_cap_co_hash_chung():
    subs = [
        sub("base", "base_sorting.java"),
        sub("v1", "variant_l1_rename.java"),
        sub("v3", "variant_l3_reorder.java"),
        sub("other", "unrelated_linkedlist.java"),
    ]
    matches = compare_all(subs, min_percent=30.0)
    pairs = {frozenset((m.submission_1_id, m.submission_2_id)) for m in matches}
    assert frozenset(("base", "v1")) in pairs
    assert frozenset(("base", "v3")) in pairs
    assert all("other" not in p for p in pairs)
    assert [m.similarity_percent for m in matches] == sorted(
        (m.similarity_percent for m in matches), reverse=True
    )


def test_khu_hoi_json(base):
    again = SubmissionFingerprints.from_dict(base.to_dict())
    assert again == base
    assert compare(base, again).similarity_percent == 100.0


# --- Hợp đồng với parse_java -------------------------------------------------

from collections import namedtuple

from ast_engine.analyzer import ParseContractError, _unpack_parse_result


def test_unpack_dem_dung_so_issues():
    R = namedtuple("R", "tree parser token_stream issues")
    assert _unpack_parse_result(R("T", None, None, [1, 2, 3])) == ("T", 3)
    assert _unpack_parse_result(R("T", None, None, [])) == ("T", 0)


def test_unpack_bao_loi_ro_rang_khi_thieu_truong_loi():
    R = namedtuple("R", "tree other")
    with pytest.raises(ParseContractError):
        _unpack_parse_result(R("T", 1))  # trước đây lặng lẽ coi là 0 lỗi


def test_hop_dong_sai_khong_bi_nuot_trong_analyze_source():
    R = namedtuple("R", "tree other")
    with pytest.raises(ParseContractError):
        analyze_source("x", "class A { }", parse_fn=lambda s: _unpack_parse_result(R("T", 1)))


# --- Né phân tích AST bằng biểu thức quá dài + lý do rơi về "lex" -----------------


def test_them_bieu_thuc_cuc_dai_khong_ep_duoc_bai_ve_che_do_lex(base):
    """Kịch bản né: chép bài + đảo hàm + chèn một biểu thức 2000 số hạng để làm sập bộ chuẩn hóa."""
    padding = "    static int pad(int a) { return " + " + ".join(["a"] * 2000) + "; }\n"
    src = read_fixture("variant_l3_reorder.java")
    src = src[: src.rindex("}")] + padding + "}\n"
    evader = analyze_source("evader", src)
    assert evader.ast is not None and evader.fallback_reason is None
    m = compare(base, evader)
    assert m.mode == "ast" and m.similarity_percent > 80.0 and m.level == LEVEL_DANGER


def test_fallback_reason_loi_cu_phap():
    r = analyze_source("x", read_fixture("base_sorting.java") + "\n int int int ;;; {{{ @@@")
    assert r.fallback_reason == "SYNTAX_ERROR" and r.ast is None and not r.parse_ok


def test_fallback_reason_sach_la_none(base):
    assert base.fallback_reason is None


def test_fallback_reason_parser_hong_bat_ngo():
    def boom(_source):
        raise RecursionError("parser sập")

    r = analyze_source("x", read_fixture("base_sorting.java"), parse_fn=boom)
    assert r.fallback_reason == "PARSER_FAILED" and r.ast is None
    assert r.lex is not None and r.syntax_error_count == 0  # không có lỗi cú pháp thật


def test_fallback_reason_chuan_hoa_hong(monkeypatch):
    import ast_engine.analyzer as az

    def boom(_tree):
        raise RuntimeError("chuẩn hóa hỏng")

    monkeypatch.setattr(az, "normalize_tree_with_lines", boom)
    r = analyze_source("x", read_fixture("base_sorting.java"))
    assert r.fallback_reason == "NORMALIZATION_FAILED" and r.ast is None and not r.parse_ok


def test_fallback_reason_khu_hoi_json():
    r = analyze_source("x", read_fixture("base_sorting.java") + "\n int int int ;;;")
    assert SubmissionFingerprints.from_dict(r.to_dict()).fallback_reason == "SYNTAX_ERROR"
