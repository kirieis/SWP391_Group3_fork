#!/usr/bin/env python3
"""Thử chạy /analyze (và tuỳ chọn /compare/batch) cho một thư mục chứa các bài nộp .java.

MỤC ĐÍCH: kiểm tra engine mới (k=15, window=25) hoạt động đúng trên bài thật, KHÔNG ghi DB.
Script chỉ ĐỌC file .java rồi gọi HTTP tới engine; không đụng gateway hay database nào.

Cách chạy (engine đang chạy ở cổng 8000):
    python scripts/reanalyze_folder.py <thư_mục_bài_nộp>
    python scripts/reanalyze_folder.py <thư_mục> --compare            # so cả thư mục với nhau
    python scripts/reanalyze_folder.py <thư_mục> --out ket_qua.json   # lưu fingerprint ra file

Chỉ dùng thư viện chuẩn của Python (không cần cài thêm gì).
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

MAX_CHARS = 100_000  # giới hạn của engine cho source_code


def post(url: str, payload: dict, timeout: float = 60.0):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:  # 4xx/5xx vẫn có thân JSON mô tả lỗi
        body = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(body)
        except ValueError:
            return e.code, {"raw": body}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", type=Path)
    ap.add_argument("--url", default="http://localhost:8000", help="địa chỉ engine (mặc định %(default)s)")
    ap.add_argument("--compare", action="store_true", help="sau khi phân tích, so cả thư mục bằng /compare/batch")
    ap.add_argument("--min-percent", type=float, default=30.0)
    ap.add_argument("--out", type=Path, help="lưu kết quả /analyze (kèm fingerprint) ra file JSON")
    args = ap.parse_args()

    files = sorted(args.folder.rglob("*.java"))
    if not files:
        print(f"Không thấy file .java nào trong {args.folder}")
        return 1

    results, fingerprints = {}, []
    print(f"{'bài':40} {'mode':5} {'k':>3} {'win':>4} {'token':>6}  ghi chú")
    for f in files:
        sid = str(f.relative_to(args.folder)).replace("\\", "/")
        code = f.read_text(encoding="utf-8", errors="replace")
        if not code.strip() or len(code) > MAX_CHARS:
            print(f"{sid:40} BỎ QUA (rỗng hoặc dài hơn {MAX_CHARS} ký tự)")
            continue
        status, body = post(f"{args.url}/analyze",
                            {"submission_id": sid, "source_code": code, "language": "java"})
        if status != 200:
            print(f"{sid:40} LỖI HTTP {status}: {json.dumps(body, ensure_ascii=False)[:150]}")
            continue
        fp = body["fingerprint"]
        lex = fp["lex"]  # fingerprint "lex" luôn có; k/window nằm TRONG fp["lex"] (và fp["ast"] nếu có)
        notes = ",".join(body.get("warnings", [])) or ""
        if body.get("fallback_reason"):
            notes = f"{body['fallback_reason']} {notes}".strip()
        print(f"{sid:40} {body['analysis_mode']:5} {lex['k']:>3} {lex['window']:>4} "
              f"{body['token_count'].get('ast', body['token_count'].get('lex', 0)):>6}  {notes}")
        results[sid] = body
        fingerprints.append({"fingerprint": fp})

    if args.out:
        args.out.write_text(json.dumps(results, ensure_ascii=False), encoding="utf-8")
        print(f"\nĐã lưu {len(results)} kết quả vào {args.out}")

    if args.compare:
        if len(fingerprints) < 2:
            print("\nCần ít nhất 2 bài hợp lệ để so sánh.")
            return 0
        status, body = post(f"{args.url}/compare/batch",
                            {"submissions": fingerprints, "min_percent": args.min_percent,
                             "with_fragments": False}, timeout=300)
        if status != 200:
            print(f"\n/compare/batch lỗi HTTP {status}: {json.dumps(body, ensure_ascii=False)[:300]}")
            return 1
        print(f"\n{body['match_count']} cặp đạt ≥ {args.min_percent}% (trên {body['submission_count']} bài):")
        for m in body["matches"]:
            print(f"  {m['similarity_percent']:5.1f}%  {m['level']:7} {m['mode']:3}  "
                  f"{m['submission_1_id']}  ~  {m['submission_2_id']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
