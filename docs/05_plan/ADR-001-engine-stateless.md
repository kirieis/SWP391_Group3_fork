# ADR-001: AST Engine không truy cập database

- **Trạng thái:** Đề xuất. Chuyển sang "Chấp nhận" khi An (gateway/DB) và người phụ trách SRS xác nhận. Thịnh (Phân hệ 5) đã đồng ý các điểm phía worker (08/10).
- **Phạm vi:** Phân hệ 4 (AST Plagiarism Detection) ↔ api-gateway ↔ Phân hệ 5 (queue/worker).
- **Cập nhật:** 2026-10-10 — chốt cổng 8000 và biến `AST_ENGINE_URL`; thêm trạng thái `NEEDS_REVIEW`; thêm lưu ý thứ tự cặp; ghi nhận quyết định "không dùng `SKIPPED` cho lỗi"; thêm phương án giao tiếp worker ↔ gateway ở M3. Phần **Quyết định** (mục 2) giữ nguyên so với bản đầu.

## 1. Bối cảnh

DB là MS SQL Server, schema do thành viên khác phụ trách và api-gateway (Node + Prisma) đã sở hữu kết nối DB.
Engine (Python 3.11 + FastAPI + ANTLR4) chỉ phân tích mã nguồn Java.

## 2. Quyết định

Engine **chỉ tính toán và trả kết quả qua HTTP**, không mở kết nối DB, không đọc Redis, không đọc file của bên ngoài (nhận `source_code`, không nhận đường dẫn):

| Endpoint | Việc làm |
|---|---|
| `POST /analyze` | 1 bài nộp → fingerprint |
| `POST /compare` | 2 bài → `similarity_percent`, `level`, `matched_fragments` |
| `POST /compare/batch` | N bài → các cặp có hash chung (so cả lớp) |

api-gateway chịu trách nhiệm ghi vào `AST_FINGERPRINTS` và `PLAGIARISM_MATCHES`.

**Địa chỉ engine:** cổng **8000**. Mọi bên đọc biến môi trường `AST_ENGINE_URL`, không hard-code.
- Local: `http://localhost:8000` · Docker Compose: `http://ast-engine:8000` (tên service `ast-engine`).

## 3. Lý do

- Không phải cấu hình 2 ORM cho cùng một DB; tránh lệch schema với Prisma.
- Dễ unit test engine (không cần DB). Hiện có hơn 100 test chạy không cần DB.
- Engine không giữ trạng thái nên chạy nhiều bản song song hoặc khởi động lại đều an toàn.
- Engine chạy ở container khác, không dùng chung ổ đĩa; nhận đường dẫn file từ bên ngoài cũng là rủi ro bảo mật.

## 4. Hợp đồng API (đúng với code hiện tại)

Tên field viết `snake_case`. Nguồn sự thật chi tiết là Swagger tại `/docs`.

### 4.1 `POST /analyze`

Vào: `{ "submission_id": "…", "source_code": "…", "language": "java" }`

Ra (HTTP 200):

```json
{
  "submission_id": "…",
  "analysis_mode": "ast | lex",
  "parse_ok": true,
  "syntax_error_count": 0,
  "fallback_reason": null,
  "token_count": { "ast": 515, "lex": 284 },
  "warnings": [],
  "fingerprint": { "…": "lưu NGUYÊN KHỐI vào AST_FINGERPRINTS.fingerprint_data" }
}
```

`fallback_reason` (khi không có fingerprint `ast`): `SYNTAX_ERROR`, `PARSER_FAILED`, `NORMALIZATION_FAILED`, `PARSE_TIMEOUT`.
`warnings` có thể chứa: `SYNTAX_ERROR_FALLBACK_LEX`, `ANALYSIS_ERROR_FALLBACK_LEX`, `PARSE_TIMEOUT_FALLBACK_LEX`, `INSUFFICIENT_DATA`.

### 4.2 `POST /compare`

Vào: hai bài, mỗi bài là **`fingerprint`** (đã lưu ở DB, nên dùng) **hoặc** `source_code` + `submission_id` (đúng một trong hai); tuỳ chọn `whitelist` (danh sách hash code mẫu), `with_fragments`.

Ra:

```json
{
  "submission_1_id": "…", "submission_2_id": "…",
  "similarity_percent": 92.5,
  "level": "SAFE | WARNING | DANGER",
  "flag": "PLAGIARISM_DETECTED | null",
  "mode": "ast | lex",
  "shared_hashes": 21, "jaccard_percent": 88.0,
  "matched_fragments": [ { "a_lines": [12, 30], "b_lines": [14, 33] } ],
  "note": null
}
```

- `level`: `SAFE` (< 30), `WARNING` (30 đến 60, đúng 60 vẫn là `WARNING`), `DANGER` (> 60). **Ngưỡng do engine quyết**; gateway và worker dùng `level`/`flag`, không tự tính lại.
- `mode = ast` chỉ khi **cả hai** bài có fingerprint `ast`, ngược lại `lex`.
- `a_lines` luôn là dòng của `submission_1`, `b_lines` là dòng của `submission_2`.
- `note = INSUFFICIENT_DATA` (bài < 15 token (= k) hoặc whitelist loại hết hash): `similarity_percent = 0` **không** có nghĩa là an toàn.

### 4.3 `POST /compare/batch`

Vào: `submissions` (2–500 bài, mỗi bài `fingerprint` hoặc `source_code`), `min_percent`, `whitelist`, `with_fragments`.
Ra: `{ "submission_count", "match_count", "matches": [ …như 4.2… ] }`, sắp giảm dần theo `similarity_percent`. Chỉ trả các cặp **có hash chung**.

### 4.4 Giới hạn và lỗi

| Giới hạn | Giá trị |
|---|---|
| Kích thước `source_code` | ≤ 100.000 ký tự |
| Số bài một lần batch | ≤ 500; trong đó tối đa **20 bài gửi `source_code`** (còn lại phải gửi `fingerprint`) |
| `k`, `window` các fingerprint | Phải giống nhau |
| Ngân sách phân tích một bài (AST) | 5 giây (`AST_ANALYSIS_TIMEOUT_SECONDS`) |

| HTTP | Ý nghĩa | Gateway làm gì |
|---|---|---|
| 200 (kể cả có `warnings`) | Thành công | Lưu kết quả; có cảnh báo thì `NEEDS_REVIEW` (xem 5.1) |
| 400 `UNSUPPORTED_LANGUAGE` | Ngôn ngữ chưa hỗ trợ | **Không retry** |
| 422 `INVALID_FINGERPRINT`, `FINGERPRINT_PARAMS_MISMATCH`, `DUPLICATE_SUBMISSION_ID`, `TOO_MANY_SOURCE_ITEMS` | Đầu vào sai | **Không retry** |
| 422 do kiểm tra schema | `detail` là **danh sách lỗi** của FastAPI, không phải `{code, message}` | **Không retry**; client xử lý cả hai dạng `detail`, log nguyên văn |
| 404, 401, 403, 408, 429 | Thường là sai URL/cấu hình hoặc quá tải tạm thời | **Ném lỗi để retry**, không nuốt thành "không retry" |
| 5xx, mất kết nối, quá thời gian | Lỗi tạm | **Retry** (an toàn: cùng đầu vào luôn ra cùng kết quả) |

Bài có lỗi cú pháp, bài quá ngắn hay bài làm parser quá chậm **không phải lỗi HTTP**: engine trả 200 kèm `warnings`, và vẫn so khớp bằng chế độ `lex`. Làm vậy để không ai né được kiểm tra bằng cách làm hỏng cú pháp (ví dụ thêm một dấu `}` thừa).

## 5. Ánh xạ kết quả → bảng

> Tên cột lấy từ SRS v1.2 và cần **đối chiếu với schema Prisma thật**; các cột ghi "đề xuất" chưa có trong SRS.

| Trường engine | Bảng / cột | Ghi chú |
|---|---|---|
| `fingerprint` (cả khối) | `AST_FINGERPRINTS.fingerprint_data` | JSON nguyên khối (`NVARCHAR(MAX)`), không lọc field |
| `submission_id` | `AST_FINGERPRINTS.submission_id` | Upsert theo khóa này; nộp lại thì ghi đè |
| `analysis_mode` | `AST_FINGERPRINTS.analysis_mode` `NVARCHAR(5)` (**đề xuất**) | `ast` / `lex` |
| `fallback_reason` | `AST_FINGERPRINTS.fallback_reason` `NVARCHAR(50)` NULL (**đề xuất**) | Giá trị dài nhất 20 ký tự |
| `warnings` | `AST_FINGERPRINTS.warnings` `NVARCHAR(MAX)` JSON (**đề xuất**) | |
| `submission_1_id`, `submission_2_id` | `PLAGIARISM_MATCHES` cùng tên | Quy ước thứ tự cặp ở 5.2 |
| `similarity_percent` | `PLAGIARISM_MATCHES.similarity_percent` | |
| `matched_fragments` | `PLAGIARISM_MATCHES.matched_fragments` | JSON; xem mục 8 về quyền riêng tư |
| `level` | `PLAGIARISM_MATCHES.level` `NVARCHAR(10)` (**đề xuất**) | `SAFE`/`WARNING`/`DANGER` |
| `mode` | `PLAGIARISM_MATCHES.mode` `NVARCHAR(5)` (**đề xuất**) | `ast`/`lex` |
| `flag = PLAGIARISM_DETECTED` | gateway đặt `SCORE_WITHHELD` và ghi `SCORE_AUDIT_LOGS` | **Engine không đặt cờ giữ điểm**, là quyết định của gateway; không đi qua `ast_check_status` |
| trạng thái kiểm tra | `Submission.ast_check_status` (**đề xuất**) | Xem 5.1 |

### 5.1 Ánh xạ `ast_check_status`

| Kết quả từ engine | `ast_check_status` | Giảng viên thấy |
|---|---|---|
| 200, `warnings` rỗng, `fallback_reason = null` | `DONE` | Kết quả bình thường |
| 200 nhưng có `warnings` hoặc `fallback_reason` | `NEEDS_REVIEW` | Có điểm kèm nhãn độ tin cậy thấp / không đủ dữ liệu / cần xem lại |
| 400 hoặc 422 | `FAILED`, không retry | Báo lỗi |
| 5xx, mất kết nối, quá thời gian, **hết số lần thử** | `FAILED` | Báo lỗi, có nút chạy lại |
| chờ xử lý | `PENDING` | |

- **Không dùng `SKIPPED` cho lỗi.** `FAILED` phải hiển thị cho giảng viên, đếm được và chạy lại được; trạng thái im lặng nghĩa là bài thoát mà không ai biết.
- Bài nộp luôn được lưu và chấm độc lập; bước AST chạy sau và không chặn việc nộp bài.

### 5.2 Thứ tự cặp trong `PLAGIARISM_MATCHES`

Quy ước **id nhỏ đứng trước** để không trùng cặp A–B và B–A (ràng buộc `UNIQUE(submission_1_id, submission_2_id)`). Hai lưu ý bắt buộc:

1. **Nếu đảo thứ tự cặp thì phải đảo cả `a_lines` và `b_lines`** trong mọi phần tử `matched_fragments`. `a_lines` luôn thuộc `submission_1`. Chỉ đảo id mà quên đảo dòng thì giảng viên mở sai đoạn code. `similarity_percent` đối xứng nên không đổi.
2. **So id đúng kiểu của khóa chính.** Engine nhận và trả id dạng chuỗi; nếu PK là số thì đổi sang số trước khi so (so chuỗi thì `"10" < "9"`).

## 6. Flow M2: gateway gọi engine đồng bộ

```
SV nộp bài ─▶ Gateway
  1. lưu Submission, ast_check_status = PENDING
  2. POST /analyze ──▶ upsert AST_FINGERPRINTS
        └ engine lỗi/quá hạn ──▶ FAILED, KHÔNG chặn việc nộp bài
  3. đọc fingerprint các bài cùng assignment từ DB
  4. POST /compare/batch (fingerprint, min_percent = 30)
  5. chỉ giữ cặp có bài mới ──▶ chuẩn hóa thứ tự cặp (5.2) ──▶ upsert PLAGIARISM_MATCHES
  6. có cặp level DANGER ──▶ SCORE_WITHHELD + SCORE_AUDIT_LOGS + báo giảng viên
  7. ast_check_status = DONE hoặc NEEDS_REVIEW (5.1); trả kết quả nộp bài
     (không lộ thông tin bài đối chiếu)
```

- Hai đường ngoại lệ: **(a)** engine lỗi/quá hạn → `FAILED`, bài vẫn được nộp; **(b)** engine trả cảnh báo → lưu và đặt `NEEDS_REVIEW`.
- **Timeout phía gateway:** khoảng 10 giây cho `/analyze` (lớn hơn ngân sách 5 giây của engine); `/compare/batch` có timeout riêng lớn hơn (gợi ý 30 giây, **chưa đo** với lớp lớn).
- Mọi lời gọi engine đi qua **một client duy nhất**: `apps/api/src/services/ast.client.ts`. Luồng kiểm tra nằm ở `apps/api/src/services/ast.service.ts` (`check(submissionId)`), do An viết.

## 7. Hệ quả và đánh đổi

- **Gateway phải gửi kèm fingerprint đã lưu khi so khớp.** Engine **không** giữ cache trong bộ nhớ, vì cache mất khi khởi động lại và không dùng chung được giữa nhiều bản chạy song song. Chi phí: mỗi lần so khớp gửi N fingerprint (vài chục KB/bài).
- `/compare/batch` so mọi cặp trong danh sách. Lớp nhỏ thì đủ dùng; lớp lớn cần endpoint "so một bài với nhiều bài" (chưa làm).
- Gateway chịu trách nhiệm đồng bộ dữ liệu: ghi đè fingerprint, xóa hoặc tính lại matches khi sinh viên nộp lại.
- **Tham số Winnowing đã đổi từ (k=25, window=40) sang (k=15, window=25)** (2026-10-11, đo ở `reports/recall_canonical.md`): ngưỡng đảm bảo 64 → 39 token. Fingerprint tạo với tham số hoặc bản chuẩn hóa cũ **không so được** với bản mới (engine trả 422 `FINGERPRINT_PARAMS_MISMATCH`): gateway phải gọi lại `/analyze` cho các bài đã lưu. SRS v1.2 (US14) cần cập nhật, và whitelist hash code mẫu phải tạo lại với tham số mới.
- Hash trong fingerprint cắt còn 52 bit để Node đọc JSON không bị làm tròn.
- **Giới hạn độ phủ:** engine bắt tốt đổi tên, comment, đảo thứ tự hàm; với bài bị AI viết lại mạnh thì recall còn thấp (khoảng 25% mức vừa, 11% mức mạnh, dữ liệu mô phỏng mẫu nhỏ; xem `reports/recall_baseline.md`). `SAFE` **không** có nghĩa là chắc chắn không đạo văn; giao diện nên ghi "không phát hiện trùng đáng kể".

## 8. Bảo mật và quyền riêng tư

- Engine **không có xác thực**: chỉ cho chạy trong mạng nội bộ (docker-compose), không mở cổng ra ngoài; nếu cần mở thì thêm API key ở header. Trình duyệt không được gọi thẳng engine.
- `matched_fragments` chứa số dòng của **cả hai** bài. Màn hình sinh viên (khi appeal) không được lộ code hay danh tính sinh viên kia; chỉ giảng viên thấy đầy đủ.
- Code nộp là dữ liệu không đáng tin: engine đã chặn kích thước và thời gian, nhưng gateway vẫn nên giới hạn kích thước ở cổng vào.

## 9. Phương án đã cân nhắc

| Phương án | Kết luận |
|---|---|
| Engine ghi thẳng DB | **Loại**: lệch schema Prisma, hai ORM cho một DB |
| Engine tự đọc job từ Redis/BullMQ | Không chọn: phụ thuộc định dạng job của BullMQ |
| Engine gọi ngược gateway (callback) | Không chọn: engine phải giữ trạng thái việc đang chạy |
| Worker tự gọi engine bằng client riêng | **Loại**: worker không có DB nên không lấy được fingerprint các bài khác để `/compare/batch`; và sẽ có hai client xử lý lỗi khác nhau |
| Hàng đợi BullMQ, worker gọi `astService.check()` | **Hướng nâng cấp** sau M2 (mục 10) |

## 10. Lộ trình nâng cấp (M3)

M2 dùng gọi đồng bộ. Khi hạ tầng hàng đợi của Phân hệ 5 sẵn sàng, đưa việc kiểm tra vào worker BullMQ. Hợp đồng API ở mục 4 giữ nguyên; chỉ đổi bên gọi `astService.check()`.

- **Retry:** backoff exponential. `attempts` là tổng số lần thử **đã tính lần đầu** (SRS ghi "retry tối đa 3 lần" thì khớp `attempts: 4`). Lỗi 400/422 dùng `UnrecoverableError`; mọi lỗi khác để BullMQ retry. Hết lượt thì `FAILED` và báo giảng viên.
- **Worker ↔ Gateway** (An/Thịnh chọn một):
  1. *(gợi ý)* Endpoint nội bộ `POST /api/internal/submissions/:id/ast-check`, xác thực `x-internal-key`, khi `apps/queue-worker` vẫn là tiến trình riêng. Yêu cầu: khóa không lộ ra trình duyệt; lỗi đầu vào → 4xx, lỗi tạm → 5xx; idempotent (upsert); timeout HTTP của worker lớn hơn tổng timeout gateway→engine; response `{ status, similarityPercent, isPlagiarism, matchedPairs }` (`similarityPercent` = cặp cao nhất, `isPlagiarism` = có ít nhất một cặp `DANGER`).
  2. Chạy worker chung tiến trình với gateway, gọi thẳng `check()`, bỏ endpoint (đổi lại worker và gateway dính nhau).

## 11. Cần xác nhận

| # | Ai | Nội dung | Tình trạng |
|---|---|---|---|
| 1 | Người làm DB/SRS | Ánh xạ mục 5 khớp schema? Thêm các cột đề xuất và `ast_check_status` (kèm `NEEDS_REVIEW`)? Cập nhật SRS v1.2 | Chờ |
| 2 | An (gateway) | Gateway ghi DB; dùng `ast.client.ts` duy nhất; viết `ast.service.ts`; ánh xạ 5.1; quy ước thứ tự cặp 5.2; thêm service `ast-engine` vào compose | Chờ |
| 3 | Thịnh (Phân hệ 5) | Dùng `astService.check()`, bỏ `SKIPPED`, dùng `level`/`flag`, cổng 8000 | **Đã đồng ý** (08/10) |
| 4 | An + Thịnh | Cách giao tiếp worker ↔ gateway ở M3 (mục 10) | Chờ (chưa cần cho M2) |
| 5 | Cả nhóm | Bài lỗi cú pháp vẫn được kiểm tra bằng chế độ `lex` thay vì bỏ qua | Thịnh đồng ý; chờ An |
