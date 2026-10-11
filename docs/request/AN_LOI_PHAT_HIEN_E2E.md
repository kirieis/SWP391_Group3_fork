# Lỗi phát hiện khi rà luồng nộp bài → kiểm tra AST (cần An xử lý)

- **Từ:** Nhật (Phân hệ 4) · **Ngày:** 2026-10-11
- **Nguồn:** đọc code gateway (`submission.controller.ts`, `submission.routes.ts`, `ast.service.ts`, `ast.client.ts`). Chưa chạy thử toàn luồng, nên đây là kết quả đọc code, không phải kết quả chạy.

---

## Tóm tắt

| # | Mức | Vấn đề | Hậu quả |
|---|---|---|---|
| 1 | **Chặn luồng** | Gateway chỉ nhận `.zip` nhưng `ast.service.ts` đọc file zip như văn bản (`readFileSync(..., "utf-8")`), **không giải nén** | Engine nhận dữ liệu nhị phân, không bao giờ phân tích được code thật. Mọi bài đều ra `lex` với rác, không phát hiện đạo văn |
| 2 | **Nghiêm trọng** | Khi chọn bài để so, không loại bài của **chính sinh viên đó** | Sinh viên nộp lại (tối đa 5 lần) sẽ giống 100% với bài cũ của mình → `DANGER` → `SCORE_WITHHELD` oan |
| 3 | Nên sửa | `DANGER` tự động đặt `SCORE_WITHHELD` và ghi `newScore = 0` vào `ScoreAuditLog` | Báo nhầm DANGER vẫn xảy ra (bài cùng đề viết độc lập, thuật toán chuẩn); điểm 0 do hệ thống ghi thiếu bước giảng viên xác nhận |
| 4 | Nhỏ | `astClient.compare()` gửi `submission_a`/`submission_b`, engine cần `submission_1`/`submission_2` | Chỉ lỗi nếu có chỗ gọi `compare()`; hiện luồng dùng `compareBatch()` nên chưa vấp |
| 5 | Nhỏ | Endpoint nội bộ đang ở `/api/submissions/internal/:id/ast-check`, thỏa thuận là `/api/internal/submissions/:id/ast-check` | Lệch với ADR-001 và với Thịnh. Chốt một đường dẫn rồi cập nhật tài liệu |
| 6 | Lưu ý | So sánh với **mọi** lần nộp cũ của sinh viên khác, không chỉ bài mới nhất | Một sinh viên nộp 5 lần tạo 5 cặp với cùng một người; bảng `plagiarism_matches` phình và gây nhiễu |

---

## 1. Giải nén zip trước khi gửi engine (quan trọng nhất)

**Vì sao sai:** zip là dữ liệu nén nhị phân. Engine nhận chuỗi này, parser Java báo lỗi cú pháp, bài rơi về chế độ `lex` và so khớp trên các ký tự rác. Kết quả: `NEEDS_REVIEW` cho mọi bài và không bao giờ ra `DANGER`, dù hai bài giống hệt.

**Cách sửa trong `ast.service.ts`** (thay bước `fs.readFileSync(...)`): mở zip, lấy các file `.java`, ghép lại thành một chuỗi rồi mới gọi `astClient.analyze`.

Điểm cần cẩn thận (đây là bản phác, An chỉnh theo thư viện đang dùng, ví dụ `adm-zip`):

```ts
import AdmZip from "adm-zip";

const MAX_ENTRIES = 500;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024; // chống zip bomb

function extractJavaSource(zipPath: string): string {
  const zip = new AdmZip(zipPath);
  const entries = zip
    .getEntries()
    .filter(e => !e.isDirectory
      && e.entryName.toLowerCase().endsWith(".java")
      && !e.entryName.includes(".."))          // chặn path traversal
    .sort((a, b) => a.entryName.localeCompare(b.entryName))  // thứ tự cố định
    .slice(0, MAX_ENTRIES);

  let total = 0;
  const parts: string[] = [];
  for (const e of entries) {
    total += e.header.size;                      // kích thước khi giải nén
    if (total > MAX_TOTAL_BYTES) break;
    const text = e.getData().toString("utf-8")
      // Bỏ package/import: ghép nhiều file vào một chuỗi thì các dòng này nằm giữa
      // chuỗi và làm Java báo lỗi cú pháp (engine vốn đã bỏ qua chúng khi so khớp).
      .replace(/^\s*package\s+[\w.]+\s*;/m, "")
      .replace(/^\s*import\s+[^;]+;/gm, "");
    parts.push(text);
  }
  return parts.join("\n");
}
```

Lưu ý:
- **Phải bỏ `package`/`import` khi ghép nhiều file**, vì Java chỉ cho phép chúng ở đầu file; ghép nguyên văn sẽ cho lỗi cú pháp giả và bài rơi về `lex`.
- Sắp xếp theo tên file để kết quả ổn định giữa các lần chạy.
- Giới hạn của engine: `source_code` tối đa **100.000 ký tự**. Zip lớn hơn sẽ nhận 422 (`FAILED`). Với M2 chấp nhận được; nếu cần nâng giới hạn thì báo Nhật.
- Zip không có file `.java` nào: đặt `ast_check_status = FAILED` kèm lý do rõ ràng, đừng gửi chuỗi rỗng (engine trả 422).

## 2. Loại bài của chính sinh viên

Trong `ast.service.ts` (câu truy vấn lấy bài để so), thêm điều kiện:

```ts
where: {
  assignmentId: submission.assignmentId,
  id: { not: submissionId },
  studentId: { not: submission.studentId },   // <-- thêm dòng này
  fingerprint: { isNot: null },
},
```

Nên cân nhắc thêm: chỉ so với **bài mới nhất của mỗi sinh viên khác** (không phải mọi lần nộp), để giảm cặp trùng lặp.

## 3. Giữ điểm tự động

Hiện tại `DANGER` → `SCORE_WITHHELD` và ghi `ScoreAuditLog` với `newScore = 0`. Engine đã đo được ít nhất một ca báo nhầm DANGER: hai bài sorting viết độc lập (cùng bubble sort, tìm kiếm nhị phân, gcd theo cách sách giáo khoa) có độ giống 66%.

Đề xuất: `DANGER` chỉ **giữ điểm chờ giảng viên xác nhận** (không ghi điểm 0 vào audit log), điểm 0 chỉ ghi sau khi giảng viên xác nhận. Đây là quyết định của An và giảng viên, không ảnh hưởng engine.

## 4–5. Việc nhỏ

- `ast.client.ts` dòng 136–137: đổi `submission_a`/`submission_b` thành `submission_1`/`submission_2`, hoặc xóa `compare()` nếu không dùng.
- Chốt đường dẫn endpoint nội bộ giữa An và Thịnh, rồi báo Nhật để sửa lại ADR-001.

---

## Cách kiểm chứng sau khi sửa

Chạy `thu_nop_bai_e2e.ps1` (đi kèm). Kết quả đúng:
- Bài 1: `DONE`, không có cặp nào.
- Bài 2 (bản ngụy trang của bài 1): `DONE`, có 1 cặp `similarity_percent` ≈ 100, `level = DANGER`, `mode = ast`.
- Trước khi sửa lỗi 1, cùng script này sẽ ra `NEEDS_REVIEW` với `fallback_reason = SYNTAX_ERROR`: đó là cách xác nhận lỗi.
