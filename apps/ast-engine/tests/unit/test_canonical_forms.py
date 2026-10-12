"""Test cho các phép chuẩn hóa "dạng viết tương đương" (mức 4 — ngụy trang kiểu AI).

Mỗi test khẳng định: hai cách viết TƯƠNG ĐƯƠNG cho cùng chuỗi token, còn hai cách viết
KHÁC NGHĨA thì vẫn cho chuỗi khác nhau (tránh chuẩn hóa quá tay làm báo nhầm).
"""

from ast_engine.normalization.tree_normalizer import normalize_tree
from tests.helpers import get_tree


def norm(body: str, **kw):
    return normalize_tree(get_tree("class A { void f(int[] a, int n) { %s } }" % body), **kw)


# ---- tăng / giảm biến --------------------------------------------------------

def test_cac_dang_tang_bien_cung_mot_dang():
    forms = ["i++;", "++i;", "i += 1;", "i = i + 1;"]
    assert len({tuple(norm(f)) for f in forms}) == 1


def test_cac_dang_giam_bien_cung_mot_dang():
    forms = ["i--;", "--i;", "i -= 1;", "i = i - 1;"]
    assert len({tuple(norm(f)) for f in forms}) == 1


def test_tang_va_giam_van_khac_nhau():
    assert norm("i++;") != norm("i--;")


def test_gan_cong_thuc_khac_bien_khong_bi_gop():
    # x = y + 1 KHÔNG phải x += 1
    assert norm("x = y + 1;") != norm("x += 1;")


def test_toan_tu_gan_ghep_khac_nhau_van_khac():
    assert norm("x *= 2;") == norm("x = x * 2;")
    assert norm("x *= 2;") != norm("x += 2;")


# ---- for <-> while ----------------------------------------------------------

def test_for_va_while_tuong_duong():
    a = norm("for (int i = 0; i < n; i++) { a[i] = 1; }")
    b = norm("int i = 0; while (i < n) { a[i] = 1; i++; }")
    assert a == b


def test_for_than_khong_ngoac_giong_co_ngoac():
    a = norm("for (int i = 0; i < n; i++) a[i] = 1;")
    b = norm("for (int i = 0; i < n; i++) { a[i] = 1; }")
    assert a == b


def test_for_each_khong_bi_chuyen():
    assert "for" in norm("for (int v : a) { n += v; }")


def test_for_khac_dieu_kien_van_khac():
    assert norm("for (int i = 0; i < n; i++) { a[i] = 1; }") != \
           norm("for (int i = 0; i <= n; i++) { a[i] = 1; }")


def test_for_vo_han_giong_while_true():
    assert norm("for (;;) { n++; }") == norm("while (true) { n++; }")


# ---- ngoặc nhọn của thân if / while -----------------------------------------

def test_if_co_va_khong_ngoac_nhon():
    assert norm("if (n > 0) n = 1; else n = 2;") == norm("if (n > 0) { n = 1; } else { n = 2; }")


def test_while_co_va_khong_ngoac_nhon():
    assert norm("while (n > 0) n--;") == norm("while (n > 0) { n--; }")


def test_than_nhieu_cau_lenh_khac_than_mot_cau_lenh():
    assert norm("while (n > 0) { n--; a[0] = 1; }") != norm("while (n > 0) { n--; }")


def test_else_if_giu_nguyen():
    a = norm("if (n > 0) n = 1; else if (n < 0) n = 2; else n = 3;")
    b = norm("if (n > 0) { n = 1; } else if (n < 0) { n = 2; } else { n = 3; }")
    assert a == b


# ---- so sánh lớn hơn <-> nhỏ hơn --------------------------------------------

def test_lon_hon_dao_ve_nho_hon():
    assert norm("if (n > 5) n = 0;") == norm("if (5 < n) n = 0;")
    assert norm("if (n >= 5) n = 0;") == norm("if (5 <= n) n = 0;")


def test_nho_hon_va_nho_hon_bang_van_khac():
    assert norm("if (n < 5) n = 0;") != norm("if (n <= 5) n = 0;")


# ---- modifier truy cập -------------------------------------------------------

def test_public_private_khong_anh_huong():
    a = normalize_tree(get_tree("class A { public int f() { return 1; } }"))
    b = normalize_tree(get_tree("class A { private int f() { return 1; } }"))
    c = normalize_tree(get_tree("class A { int f() { return 1; } }"))
    assert a == b == c


def test_static_van_phan_biet():
    a = normalize_tree(get_tree("class A { static int f() { return 1; } }"))
    b = normalize_tree(get_tree("class A { int f() { return 1; } }"))
    assert a != b


# ---- công tắc tắt -------------------------------------------------------------

def test_tat_canonical_giu_nguyen_dang_goc():
    assert norm("i++;", canonical=False) != norm("i += 1;", canonical=False)
    assert "for" in norm("for (int i = 0; i < n; i++) { a[i] = 1; }", canonical=False)


# ---- an toàn ---------------------------------------------------------------

def test_bieu_thuc_rat_dai_khong_de_quy():
    expr = " + ".join(["n"] * 3000)
    assert norm("n = %s;" % expr)  # không ném RecursionError
