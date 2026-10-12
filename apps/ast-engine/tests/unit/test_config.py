from ast_engine.config import THRESHOLDS, WINNOWING


def test_gia_tri_theo_srs():
    assert (WINNOWING.k, WINNOWING.window) == (15, 25)
    assert WINNOWING.guarantee_threshold == 39
    assert (THRESHOLDS.warning, THRESHOLDS.danger) == (30.0, 60.0)
