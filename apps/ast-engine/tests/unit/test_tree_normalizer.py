"""Test cho normalization/tree_normalizer.py (chạy trên parse tree ANTLR thật)."""

from ast_engine.normalization.tree_normalizer import normalize_tree, normalize_tree_with_lines
from tests.helpers import get_tree, read_fixture


def norm(src: str, **kw):
    return normalize_tree(get_tree(src), **kw)


WRAP = "class A { %s }"


def test_doi_ten_bien_ham_tham_so_khong_doi_ket_qua():
    a = norm(WRAP % "int tong(int a, int b) { int s = a + b; return s; }")
    b = norm(WRAP % "int cong(int x, int y) { int kq = x + y; return kq; }")
    assert a == b
    assert "FUNC" in a and "PARAM" in a and "VAR" in a


def test_doi_ten_class_khong_doi_ket_qua():
    assert norm("class Foo { }") == norm("class Bar { }")


def test_literal_duoc_gop():
    assert norm(WRAP % 'void f() { int x = 5; String s = "abc"; }') == \
           norm(WRAP % 'void f() { int x = 99; String s = "xyz"; }')


def test_comment_va_khoang_trang_khong_anh_huong():
    a = norm(WRAP % "int f(int a){return a+1;}")
    b = norm(WRAP % "// ghi chu\n int f( int a ) {\n /* x */ return a + 1 ; }")
    assert a == b


def test_import_va_package_bi_bo():
    a = norm("package p; import java.util.List; class A { void f() { } }")
    b = norm("class A { void f() { } }")
    assert a == b


def test_dao_thu_tu_ham_khong_doi_ket_qua():
    f1 = "int a1(int x) { return x + 1; }"
    f2 = "void b1() { for (int i = 0; i < 3; i++) { } }"
    assert norm(WRAP % (f1 + f2)) == norm(WRAP % (f2 + f1))


def test_tat_sort_members_thi_thu_tu_van_khac_nhau():
    f1 = "int a1(int x) { return x + 1; }"
    f2 = "void b1() { for (int i = 0; i < 3; i++) { } }"
    a = norm(WRAP % (f1 + f2), sort_members=False)
    b = norm(WRAP % (f2 + f1), sort_members=False)
    assert a != b


def test_logic_khac_thi_chuoi_khac():
    a = norm(WRAP % "void f() { for (int i = 0; i < 3; i++) { } }")
    b = norm(WRAP % "void f() { int i = 0; while (i < 3) { i++; } }")
    assert a != b


def test_bien_ten_record_khong_bi_nham_thanh_tu_khoa():
    assert norm(WRAP % "void f() { int record = 1; }") == norm(WRAP % "void f() { int rec = 1; }")


def test_bieu_thuc_rat_dai_khong_tran_stack():
    expr = " + ".join(["a"] * 300)
    tokens = norm(WRAP % f"int f(int a) {{ return {expr}; }}")
    assert tokens.count("VAR") >= 300


def test_kem_so_dong_nguon():
    toks = normalize_tree_with_lines(get_tree("class A {\n  void f() {\n    int x = 1;\n  }\n}"))
    assert all(t.line >= 1 for t in toks)
    assert max(t.line for t in toks) == 3


def test_fixture_cac_muc_nguy_trang_ra_cung_chuoi_token():
    base = norm(read_fixture("base_sorting.java"))
    for name in ("variant_l1_rename.java", "variant_l2_comments.java", "variant_l3_reorder.java"):
        assert norm(read_fixture(name)) == base, name


def test_fixture_khac_han_thi_khac():
    assert norm(read_fixture("unrelated_linkedlist.java")) != norm(read_fixture("base_sorting.java"))


def test_bieu_thuc_cuc_dai_van_chuan_hoa_duoc():
    """Trước đây đệ quy sập ở ~1000 số hạng và bài âm thầm rơi về chế độ 'lex'."""
    expr = " + ".join(["a"] * 5000)
    tokens = norm(WRAP % f"int f(int a) {{ return {expr}; }}")
    assert tokens.count("VAR") >= 5000
