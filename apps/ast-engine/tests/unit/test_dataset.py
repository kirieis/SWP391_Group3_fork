"""Bảo vệ hồi quy cho bộ dữ liệu ngụy trang (tests/fixtures/plagiarism/dataset).

Phần L4/L5 (AI viết lại) CHƯA đạt — xem reports/recall_baseline.md — nên không có test ép đạt;
khi cải thiện thuật toán, hãy thêm test cho L4/L5 vào đây.
"""

import re
from pathlib import Path

import pytest

from ast_engine.analyzer import analyze_source
from ast_engine.similarity.matcher import LEVEL_DANGER, LEVEL_SAFE, compare

DATASET = Path(__file__).resolve().parents[1] / "fixtures" / "plagiarism" / "dataset"
GROUPS = sorted(p.name for p in DATASET.iterdir() if p.is_dir())


@pytest.fixture(scope="module")
def subs():
    out = {}
    for f in DATASET.glob("*/*.java"):
        out[f"{f.parent.name}/{f.stem}"] = analyze_source(f"{f.parent.name}/{f.stem}", f.read_text(encoding="utf-8"))
    return out


def test_moi_file_dataset_deu_parse_sach(subs):
    """File dataset hỏng cú pháp sẽ làm lệch số đo (rơi về 'lex') mà không ai hay biết."""
    assert len(subs) >= 21
    assert [k for k, v in subs.items() if not v.parse_ok] == []


@pytest.mark.parametrize("group", GROUPS)
@pytest.mark.parametrize("variant", ["l1_rename", "l2_comments", "l3_reorder"])
def test_nguy_trang_muc_1_den_3_luon_bi_gan_co(subs, group, variant):
    m = compare(subs[f"{group}/original"], subs[f"{group}/{variant}"])
    assert m.mode == "ast" and m.level == LEVEL_DANGER, f"{group}/{variant}: {m.similarity_percent:.0f}%"


@pytest.mark.parametrize("group", GROUPS)
def test_bai_viet_doc_lap_cung_de_khong_bi_bao_nham(subs, group):
    m = compare(subs[f"{group}/original"], subs[f"{group}/independent"])
    assert m.level == LEVEL_SAFE, f"{group}: {m.similarity_percent:.0f}%"


def test_khac_nhom_khong_bi_bao_nham(subs):
    names = sorted(subs)
    bad = []
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            if a.split("/")[0] != b.split("/")[0]:
                if compare(subs[a], subs[b], with_fragments=False).level != LEVEL_SAFE:
                    bad.append((a, b))
    assert bad == []
