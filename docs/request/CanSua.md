# Cần sửa ở gateway sau lần chạy e2e thật

- **Gửi:** An (Phân hệ 1, gateway + DB)
- **Từ:** Nhật (Phân hệ 4) · **Ngày:** 2026-10-12
- **Cách tái hiện:** engine chạy ở cổng 8000, gateway `npm run dev` ở cổng 5000, rồi chạy `thu_nop_bai_e2e.ps1` (trong `apps/ast-engine/tests/fixtures/demo/`). Script tạo lớp và assignment, cho 2 sinh viên nộp 2 file Java gần như giống hệt nhau, rồi in kết quả.

**Ghi chú:** các gợi ý sửa bên dưới Nhật chưa đọc code của An, chỉ dựa trên log lỗi và kết quả chạy. An xem rồi quyết định cách phù hợp nhất.

---

## Kết quả đã chạy đúng (không cần sửa)

- Giải nén zip lấy được file Java.
- Loại trừ bài của cùng một sinh viên khi so sánh.
- Engine trả đúng: 1 cặp `similarityPercent = 100`, `level = DANGER`, `mode = ast`, và cặp này đã được lưu vào `PLAGIARISM_MATCHES`.
- Góc nhìn sinh viên không lộ bài của người kia.
- Bài 1 (bài gốc): `astCheckStatus = DONE`.

---

## Lỗi 1 (chặn): bài DANGER bị `FAILED`, không đặt được `SCORE_WITHHELD`

**Triệu chứng:** bài 2 sau khi chạy xong có `astCheckStatus = FAILED` và `status = PENDING`. Kỳ vọng là `DONE` và `SCORE_WITHHELD`.

**Log gateway:**

```
prisma:error The INSERT statement conflicted with the FOREIGN KEY constraint
"score_audit_logs_editor_id_fkey". The conflict occurred in database "aita_db",
table "dbo.users", column 'id'.
Invalid `tx.scoreAuditLog.create()` invocation in
apps/api/src/services/ast.service.ts:304:56
[astService] Lỗi nghiêm trọng khi chạy check(db090bb4-35e3-44f2-a85b-1db236496868)
```

**Nguyên nhân:** khi có cặp `DANGER`, `ast.service.ts` ghi `ScoreAuditLog` với `editorId` không tồn tại trong bảng `users`. Đây là hành động tự động của hệ thống, không phải của một người dùng thật, nên không có id hợp lệ để điền. Transaction bị rollback, nên `status` không đổi thành `SCORE_WITHHELD`, rồi `catch` đặt `FAILED`.

**Gợi ý sửa (chọn một):**

| Cách | Làm gì | Ưu | Nhược |
|---|---|---|---|
| **A (đề xuất)** | Trong `schema.prisma`, đổi `editorId` của `ScoreAuditLog` thành **tùy chọn** (`String?`) và quan hệ tới `User` thành tùy chọn. Hành động tự động để `editorId = null`, kèm cột `source` (ví dụ `'AST_ENGINE'`) hoặc ghi rõ trong `reason`. Sau đó `npx prisma db push` | Không cần dữ liệu seed, đúng ngữ nghĩa "không do người nào làm" | Phải sửa schema; giao diện đọc log cần xử lý `editorId = null` |
| B | Seed một user hệ thống (ví dụ email `system@aita.local`) và dùng id của nó làm `editorId` | Không đổi schema | Mỗi môi trường (dev, CI, production) phải seed; user này không nên đăng nhập được |

Sau khi sửa, kiểm tra lại: nộp lại cặp bài giống nhau thì bài 2 phải có `astCheckStatus = DONE`, `status = SCORE_WITHHELD`, và bảng `score_audit_logs` có đúng 1 dòng cho bài đó.

---

## Lỗi 2: ghi matches và đổi trạng thái không cùng một transaction

**Triệu chứng:** sau lỗi 1, cặp DANGER đã nằm trong `PLAGIARISM_MATCHES` nhưng bài lại `FAILED`. Giảng viên sẽ thấy một bài bị đánh lỗi mà vẫn có cặp trùng, tức là dữ liệu mâu thuẫn nhau.

**Gợi ý sửa:** gom các bước sau vào **một** `prisma.$transaction`: upsert fingerprint, ghi matches, đặt `ast_check_status`, đặt `SCORE_WITHHELD`, ghi `ScoreAuditLog`. Lỗi ở bước nào thì toàn bộ rollback, và `catch` đặt `FAILED` cho bài mà không để lại cặp lẻ. Nếu muốn giữ matches ngay cả khi bước điểm lỗi, thì đặt trạng thái `NEEDS_REVIEW` thay vì `FAILED` để giảng viên vẫn thấy cặp.

---

## Lỗi 3 (nên sửa): idempotent khi chạy lại

Hàm `check(submissionId)` đã được thiết kế idempotent (upsert). Sau khi sửa lỗi 1, nhờ An xác nhận: gọi `check()` lần 2 cho cùng một bài **không** nhân đôi dòng trong `PLAGIARISM_MATCHES` và **không** nhân đôi dòng `ScoreAuditLog`. Với audit log, nên kiểm tra "đã có log cho bài này với lý do này chưa" trước khi tạo.

---

## Các lưu ý còn lại từ lần trước (chưa kiểm chứng)

1. **Bài > 100.000 ký tự:** hiện bị cắt bớt. Nên đặt `FAILED` (kèm lý do) thay vì cắt, vì cắt sẽ làm kết quả so sánh sai mà không ai biết.
2. **Kiểm tra zip bomb:** nên dựa trên kích thước **thực tế sau giải nén** (cộng dồn khi đọc), không chỉ dựa vào kích thước khai báo trong header của zip.
3. **Hai route nội bộ trùng nhau** (`/api/internal/submissions/:id/ast-check` và `/api/submissions/internal/:id/ast-check`): bỏ một route khi Thịnh chốt cách worker gọi (M3).
4. **DANGER tự động `SCORE_WITHHELD`:** kết quả đo thực nghiệm của engine có khoảng 1/306 cặp không đạo văn bị báo DANGER (bài mẫu giống nhau như sắp xếp, tìm kiếm cơ bản). Vì vậy giao diện giảng viên nên có cách **gỡ giữ điểm** nhanh, và ghi rõ đây là "giữ để xem lại" chứ không phải kết luận đạo văn.

---

## An báo lại khi xong

Nhật chạy lại `thu_nop_bai_e2e.ps1` và gửi bảng tóm tắt cuối. Cả 4 dòng phải là `[DAT]`:

```
[DAT]  Bai 1 astCheckStatus = DONE
[DAT]  Bai 2 astCheckStatus = DONE
[DAT]  Bai 2 status = SCORE_WITHHELD
[DAT]  Co 1 cap DANGER, mode ast, ~100%
```
