# Tin nhắn: AST Engine đổi tham số Winnowing sang (k=15, window=25)

Ngày: 2026-10-11 · Từ: Nhật (Phân hệ 4)

---

## Gửi An (Phân hệ 1, gateway/DB)

> An ơi, engine vừa đổi tham số Winnowing từ (k=25, window=40) sang **(k=15, window=25)**, và bản chuẩn hóa cũng được nâng cấp (nhận thêm các dạng viết tương đương như `for`↔`while`, `i++`↔`i+=1`). Lý do: đo trên bộ dữ liệu ngụy trang, recall mức DANGER tăng từ 60% lên 73% mà số ca báo nhầm DANGER không tăng (1/306 cặp ở cả hai cấu hình) (`reports/recall_canonical.md`).
>
> **Hợp đồng API không đổi** (không thêm hay bớt field, không đổi tên endpoint). Chỉ có một việc phía bạn:
>
> **Các fingerprint đã lưu trong `AST_FINGERPRINTS` là bản cũ (k=25), không so được với bản mới.** Nếu để nguyên, `/compare` và `/compare/batch` trả 422 `FINGERPRINT_PARAMS_MISMATCH`, `astClient` không retry nên bài sẽ có `ast_check_status = FAILED`. Bạn cần tạo lại fingerprint:
>
> - Nếu trong DB chỉ là bài thử: xóa các dòng `AST_FINGERPRINTS` và `PLAGIARISM_MATCHES`, rồi cho `astService.check()` chạy lại từng bài.
> - Nếu có bài cần giữ: viết script duyệt các bài nộp, gọi `check()` lần lượt (upsert đè, vì hàm đã idempotent).
>
> Sau khi chạy lại, kiểm tra một bài bất kỳ: trong `fingerprint_data`, `lex.k` phải bằng 15 và `lex.window` bằng 25 (nếu có `ast` thì `ast.k`, `ast.window` cũng vậy).
>
> Bạn cũng đừng hard-code k/window ở gateway; nếu có chỗ nào đang truyền k hoặc window sang engine thì bỏ đi để engine dùng mặc định.
>
> Gửi mình `ast.service.ts` nếu muốn mình viết giúp script chạy lại. Mình cũng đã cập nhật ADR-001 và file hướng dẫn tích hợp (`docs/05_plan/`).

---

## Gửi người làm SRS

> Chào bạn, Phân hệ 4 (AST Engine) cần cập nhật SRS v1.2 vì tham số Winnowing đã đổi:
>
> | Mục | Hiện ghi | Đổi thành |
> |---|---|---|
> | US14: độ dài k-gram `k` | 25 | **15** |
> | US14: kích thước cửa sổ `window` | 40 | **25** |
> | Ngưỡng đảm bảo phát hiện (`window + k − 1`), nếu SRS có nhắc | 64 token | **39 token** |
> | Bài quá ngắn không đủ dữ liệu (`INSUFFICIENT_DATA`), nếu SRS có nhắc | < 25 token | **< 15 token** |
>
> **Lý do:** đo trên bộ dữ liệu ngụy trang (3 bài mẫu, 15 cặp đạo văn, 306 cặp không đạo văn) cho thấy:
> - Recall mức DANGER (> 60%) tăng từ 60% lên 73%.
> - Recall mức WARNING trở lên (≥ 30%) tăng từ 80% lên 93%.
> - Báo nhầm mức DANGER không tăng (1/306 cặp ở cả hai cấu hình); báo nhầm mức WARNING tăng từ 2% lên 4%.
>
> Các ngưỡng 30% và 60% **không đổi**. Số liệu chi tiết ở `apps/ast-engine/reports/recall_canonical.md`.
>
> **Lưu ý khi trích số liệu:** đây là mẫu nhỏ và các bài ngụy trang do người viết tay mô phỏng, nên chỉ nên ghi là kết quả thực nghiệm sơ bộ, không ghi như cam kết.
>
> Nhờ bạn xác nhận khi cập nhật xong để mình đổi trạng thái ADR-001 sang "Chấp nhận".
