# Hướng dẫn tích hợp AST Engine (Phân hệ 4) — dành cho An và Thịnh

- **Người gửi:** Nhật (Phân hệ 4 — AST Plagiarism Detection)
- **Ngày:** 2026-10-08
- **Gửi:** An (Dev 1, gateway) · Thịnh (Phân hệ 5, queue/worker)
- **Mục đích:** để hai bạn **tự thống nhất và làm tiếp mà không cần chờ Nhật**. File này gom và thay thế `PHAN_HOI_ADR-001_Phan_he_4.md`.
- **Cách dùng:** đọc §1 và §2 (10 phút) → làm checklist của mình (§4, §5) → hai bạn họp ngắn để điền §7 → chạy §8 để nghiệm thu.

> **Nguồn sự thật về API là Swagger của engine:** `http://localhost:8000/docs`. Nếu file này và Swagger khác nhau, tin Swagger rồi báo Nhật sửa file.

---

## 1. Đã chốt (phía engine, không cần bàn lại)

| # | Quyết định | Lý do ngắn |
|---|---|---|
| 1 | Engine **chỉ tính toán**, không đọc DB, không đọc file, không đọc Redis (ADR-001) | Không phải cấu hình 2 ORM cho một DB; engine dễ test; chạy nhiều bản song song được |
| 2 | Engine nhận **nội dung code** (`source_code`), không nhận đường dẫn file | Engine chạy ở container khác, không dùng chung ổ đĩa; nhận đường dẫn từ bên ngoài cũng là rủi ro bảo mật |
| 3 | Engine **cổng 8000**; mọi bên đọc biến `AST_ENGINE_URL`, không hard-code | Local: `http://localhost:8000`. Docker: `http://ast-engine:8000` (tên service đề xuất) |
| 4 | **Chỉ một client** gọi engine: `apps/api/src/services/ast.client.ts`. Không ai viết client thứ hai | Cùng một lỗi engine phải được xử lý giống nhau ở mọi luồng |
| 5 | **Ngưỡng do engine quyết:** gateway/worker dùng `level` và `flag` engine trả về, không tự tính lại | Ngưỡng nằm ở `config.py` của engine; nếu Nhật chỉnh để tăng recall thì bản sao ngưỡng ở nơi khác sẽ lệch |
| 6 | **Bài lỗi cú pháp vẫn được kiểm tra** (engine trả 200 kèm cảnh báo, so bằng chế độ `lex`), không đánh `SKIPPED` | Xem §3: nếu bỏ qua bài lỗi cú pháp thì chỉ cần thêm một dấu `}` thừa là né được kiểm tra |

Điểm 6 là **đề nghị của Phân hệ 4**, vì liên quan trực tiếp đến mục tiêu phát hiện > 80% trong AST Bypass Challenge. Nếu cả nhóm quyết định khác thì báo Nhật, vì nó ảnh hưởng đến cách trình bày với giảng viên.

---

## 2. Hợp đồng của engine

Tên field viết `snake_case`. Dùng `Content-Type: application/json`.

### 2.1 `POST /analyze` — một bài → fingerprint

Vào:
```json
{ "submission_id": "S10", "source_code": "<nội dung file .java>", "language": "java" }
```
`submission_id` 1–100 ký tự, `source_code` 1–100.000 ký tự, `language` mặc định `java` (hiện chỉ hỗ trợ Java).

Ra (HTTP 200):
```json
{
  "submission_id": "S10",
  "analysis_mode": "ast",
  "parse_ok": true,
  "syntax_error_count": 0,
  "fallback_reason": null,
  "token_count": { "ast": 515, "lex": 284 },
  "warnings": [],
  "fingerprint": { "…": "lưu NGUYÊN KHỐI vào AST_FINGERPRINTS.fingerprint_data" }
}
```
- `analysis_mode`: `ast` hoặc `lex`.
- `fallback_reason` (khi không có fingerprint `ast`): `SYNTAX_ERROR`, `PARSER_FAILED`, `NORMALIZATION_FAILED`, `PARSE_TIMEOUT`; còn lại là `null`.
- `warnings` có thể gồm: `SYNTAX_ERROR_FALLBACK_LEX`, `ANALYSIS_ERROR_FALLBACK_LEX`, `PARSE_TIMEOUT_FALLBACK_LEX`, `INSUFFICIENT_DATA`.
- Hash trong fingerprint ≤ 52 bit nên Node đọc JSON không bị làm tròn. **Lưu nguyên JSON, không lọc field**, vì sẽ gửi lại nguyên khối ở `/compare`.

### 2.2 `POST /compare` — hai bài → độ giống

Vào (mỗi bài gửi **đúng một** trong hai: `fingerprint` hoặc `source_code`):
```json
{
  "submission_1": { "fingerprint": { "…": "object lấy từ /analyze" } },
  "submission_2": { "fingerprint": { "…": "…" } },
  "whitelist": [],
  "with_fragments": true
}
```
Gửi `source_code` thì bắt buộc kèm `submission_id`. `whitelist` là danh sách hash của code mẫu cần loại trừ (rủi ro R04).

Ra:
```json
{
  "submission_1_id": "S9", "submission_2_id": "S10",
  "similarity_percent": 92.5,
  "level": "DANGER",
  "flag": "PLAGIARISM_DETECTED",
  "mode": "ast",
  "shared_hashes": 21, "jaccard_percent": 88.0,
  "matched_fragments": [ { "a_lines": [12, 30], "b_lines": [14, 33] } ],
  "note": null
}
```
- `level`: `SAFE` (< 30), `WARNING` (30 đến 60, **đúng 60 vẫn là WARNING**), `DANGER` (> 60). `flag` chỉ có giá trị `PLAGIARISM_DETECTED` khi `DANGER`, ngược lại `null`.
- `mode`: `ast` nếu **cả hai** bài có fingerprint `ast`, ngược lại `lex`. Hai chế độ không so với nhau.
- `a_lines` luôn là dòng của `submission_1`, `b_lines` là dòng của `submission_2`.
- `note = "INSUFFICIENT_DATA"` khi một bài quá ngắn (< 15 token, tức < k) hoặc whitelist loại hết hash; lúc đó `similarity_percent` là 0 và **không được hiểu là "không đạo văn"**.

### 2.3 `POST /compare/batch` — cả lớp

Vào:
```json
{
  "submissions": [ { "fingerprint": { "…": "…" } }, { "fingerprint": { "…": "…" } } ],
  "min_percent": 30,
  "whitelist": [],
  "with_fragments": true
}
```
Ra: `{ "submission_count": N, "match_count": M, "matches": [ …mỗi phần tử có dạng như §2.2… ] }`, sắp giảm dần theo `similarity_percent`. Chỉ trả các cặp có hash chung và đạt `min_percent`.

### 2.4 Giới hạn

| Giới hạn | Giá trị |
|---|---|
| Kích thước `source_code` | ≤ 100.000 ký tự |
| Số bài một lần batch | 2 đến 500; trong đó tối đa **20 bài gửi `source_code`** (còn lại phải gửi `fingerprint`) |
| `submission_id` trong batch | Không được trùng |
| `k`, `window` của các fingerprint | Phải giống nhau, nếu không bị 422 |
| Ngân sách phân tích một bài (đường AST) | 5 giây (biến môi trường `AST_ANALYSIS_TIMEOUT_SECONDS`) |

### 2.5 Lỗi và cách xử lý

| HTTP | Nghĩa | Làm gì |
|---|---|---|
| 200, kể cả có `warnings` | Thành công | Lưu kết quả; xem §3 để đặt trạng thái |
| 400 `UNSUPPORTED_LANGUAGE` | Ngôn ngữ chưa hỗ trợ | **Không retry** |
| 422 `INVALID_FINGERPRINT`, `FINGERPRINT_PARAMS_MISMATCH`, `DUPLICATE_SUBMISSION_ID`, `TOO_MANY_SOURCE_ITEMS` | Đầu vào sai | **Không retry** |
| 422 do kiểm tra schema (thiếu field, rỗng, quá dài) | **`detail` là danh sách lỗi** của FastAPI, không phải `{code, message}` | **Không retry**; client phải xử lý cả hai dạng `detail` và log nguyên văn |
| 404, 401, 403, 408, 429 | Thường là sai URL, sai cấu hình hoặc quá tải tạm thời | **Ném lỗi để retry**, đừng nuốt thành "không retry" |
| 5xx, mất kết nối, quá thời gian | Lỗi tạm | **Retry** (an toàn: cùng đầu vào luôn ra cùng kết quả) |

Bài lỗi cú pháp, bài quá ngắn và bài làm parser quá chậm **không phải lỗi HTTP**: engine trả 200 kèm `warnings`.

---

## 3. Ánh xạ trạng thái `ast_check_status`

| Tình huống | Engine trả | `ast_check_status` | Giảng viên thấy gì |
|---|---|---|---|
| Bài sạch | 200, `warnings` rỗng, `fallback_reason` là `null` | `DONE` | Kết quả bình thường |
| Bài lỗi cú pháp | 200, `SYNTAX_ERROR_FALLBACK_LEX`, `mode = lex` | `NEEDS_REVIEW` | Có điểm similarity kèm nhãn "bài lỗi cú pháp, độ tin cậy thấp" |
| Bài quá ngắn | 200, `INSUFFICIENT_DATA` | `NEEDS_REVIEW` | "Không đủ dữ liệu để kết luận" |
| Parse quá hạn | 200, `PARSE_TIMEOUT_FALLBACK_LEX` | `NEEDS_REVIEW` | Đáng xem lại: có thể cố ý làm khó parser |
| Engine tắt/bận | 5xx hoặc không phản hồi, **sau khi hết số lần thử** của BullMQ | `FAILED` | Báo lỗi, có nút chạy lại |
| Đầu vào sai | 400 hoặc 422 | `FAILED`, không retry | Báo lỗi (bài quá lớn cũng đáng xem lại) |

`level = DANGER` được xử lý ở **điểm số** (`SCORE_WITHHELD` + ghi `SCORE_AUDIT_LOGS`), không đi qua `ast_check_status`.

### Vì sao không dùng `SKIPPED` cho lỗi

Hãy đặt mình vào vị trí đối thủ trong AST Bypass Challenge: copy bài, đổi tên, **thêm một dấu `}` thừa**. Nếu bài lỗi cú pháp bị `SKIPPED` thì nó không bị kiểm tra gì. Chế độ `lex` vẫn bắt được đổi tên và comment (100% trên bộ dữ liệu hiện có). Nó yếu hơn ở đảo hàm (33% trên dữ liệu đó), nhưng yếu vẫn hơn không kiểm tra. Đường "lỗi cú pháp thì rơi về `lex`" cũng chính là **một đường ngoại lệ** để trình bày với rubric M2.

Mục tiêu "AST không làm treo tiến trình nộp bài" **vẫn được giữ**: bài nộp luôn được lưu và chấm trước/độc lập, bước AST chạy sau và không chặn gì.

Khác biệt thật giữa `FAILED` và `SKIPPED` nằm ở **tính hiển thị**: `FAILED` phải hiện cho giảng viên, đếm được và chạy lại được. Một trạng thái im lặng nghĩa là bài thoát mà không ai biết.

---

## 4. Việc của An

- [ ] Giữ `ast.client.ts` là **client duy nhất**. Chỉ 400 và 422 là "không retry" (trả `undefined` hoặc ném lỗi loại không retry). Mọi lỗi khác (kể cả 404, 401, 403, 408, 429) thì **ném lỗi**. Log nguyên văn `detail` của lỗi (§2.5, có hai dạng).
- [ ] Đặt timeout phía gateway **lớn hơn 5 giây** của engine (gợi ý 10 giây cho `/analyze`). `/compare/batch` nên có timeout riêng lớn hơn (gợi ý 30 giây; **chưa đo với lớp lớn**, hãy đo).
- [ ] Tách luồng kiểm tra thành `apps/api/src/services/ast.service.ts` với hàm `check(submissionId)` (nhiều khả năng đã có trong route nộp bài, chỉ cần đưa ra thành hàm). Hàm làm:
  1. Đọc file bài nộp → `source_code`.
  2. `POST /analyze` → upsert `AST_FINGERPRINTS` (JSON nguyên khối, kèm `analysis_mode`, `fallback_reason`, `warnings`).
  3. Lấy fingerprint các bài cùng assignment từ DB.
  4. `POST /compare/batch` (`min_percent` = 30).
  5. Chỉ giữ cặp có bài mới → chuẩn hóa thứ tự cặp → upsert `PLAGIARISM_MATCHES`.
  6. Có cặp `DANGER` → `SCORE_WITHHELD` + ghi `SCORE_AUDIT_LOGS`.
  7. Đặt `ast_check_status` theo §3.
- [ ] Chuẩn hóa cặp "id nhỏ đứng trước": **nếu đảo thứ tự thì phải đảo cả `a_lines` và `b_lines`** trong mọi phần tử `matched_fragments`. So id đúng kiểu của khóa chính (nếu là số thì đổi sang số, vì so chuỗi thì `"10" < "9"`).
- [ ] Khi sinh viên nộp lại: ghi đè fingerprint cũ, xóa hoặc tính lại các `PLAGIARISM_MATCHES` liên quan, không để trùng cặp (ràng buộc `UNIQUE`).
- [ ] Thêm cột `level`, `mode` (`PLAGIARISM_MATCHES`) và 3 cột của `ast_fingerprints` vào Prisma sau khi người làm SRS xác nhận. Đã đối chiếu: giá trị engine trả đều vừa kiểu cột bạn đề xuất (`level` tối đa 7 ký tự, `mode` 3, `fallback_reason` tối đa 20).
- [ ] Thêm service `ast-engine` vào `docker-compose.yml` (cổng 8000) và `AST_ENGINE_URL` vào `.env.example`.
- [ ] Màn hình sinh viên (khi appeal) **không** hiện code hay danh tính của sinh viên đối chiếu; chỉ giảng viên thấy đầy đủ `matched_fragments`.

## 5. Việc của Thịnh

- [ ] Cập nhật ghi chú/cài đặt worker theo hợp đồng thật (§2). Ba chỗ lệch cần sửa: (a) cổng 8001 → 8000, đọc `AST_ENGINE_URL`; (b) request đừng gửi `sourceCodePath`/camelCase, engine cần `submission_id` + `source_code`; (c) `/analyze` **không trả similarity**, chỉ trả fingerprint.
- [ ] Worker **không gọi engine trực tiếp**: gọi `astService.check(...)` của An (§4), hàm này dùng `ast.client.ts`.
- [ ] BullMQ: backoff exponential. **Lưu ý:** `attempts` là **tổng số lần thử, đã tính lần đầu**. `attempts: 3` nghĩa là 1 lần đầu + 2 lần retry. Nếu SRS (US12, NFR-13) ghi "retry tối đa 3 lần" thì khớp với `attempts: 4`; hãy chọn theo đúng chữ của SRS. Lỗi đầu vào (400, 422) dùng `UnrecoverableError` để không retry; mọi lỗi khác để BullMQ retry. Hết lượt thì đặt `ast_check_status = FAILED` **và báo giảng viên**.
- [ ] Không đánh `SKIPPED` cho lỗi cú pháp hoặc server bận (xem §3).
- [ ] Không tự áp ngưỡng 30/60: dùng `level`/`flag` trong kết quả.
- [ ] Đảm bảo bài nộp được lưu và chấm **độc lập** với job AST: job AST lỗi không được ảnh hưởng đến điểm hay tiến trình nộp.
- [ ] Trả lời cùng An câu hỏi 3.1: worker chạy trong gateway hay service riêng (xem §7).

## 6. Việc của Nhật

- [ ] Đổi `apps/ast-engine/Dockerfile` từ 8001 sang 8000 (`EXPOSE` và `--port`).
- [ ] Cập nhật ADR-001: thêm `NEEDS_REVIEW`, `AST_ENGINE_URL`, lưu ý thứ tự cặp.
- [ ] Giữ Swagger `/docs` đúng với hợp đồng; trả lời câu hỏi về hành vi engine.
- [ ] Việc dài hạn của Phân hệ 4: nâng recall trên bài AI viết lại, endpoint "so một bài với nhiều bài", whitelist cho giảng viên.

---

## 7. Hai bạn tự quyết (đã có gợi ý mặc định)

Hai bạn thống nhất rồi điền cột **Quyết định**. Không cần hỏi Nhật, trừ khi quyết định đổi hành vi của engine.

| # | Vấn đề | Gợi ý mặc định | Quyết định |
|---|---|---|---|
| 1 | Ai viết `ast.service.ts` | An (gateway và DB của An) | Thịnh đồng ý (08/10); chờ An xác nhận |
| 2 | `similarityPercent` trong kết quả `check()` nghĩa là gì (một bài so với nhiều bài) | Cặp **cao nhất** của bài đó; `isPlagiarism` = có ít nhất một cặp `DANGER` | |
| 3 | Worker chạy trong gateway hay service riêng (câu 3.1 của An) | Trong gateway cho M2. Nếu sau này tách riêng thì đưa `ast.client.ts` và `ast.service.ts` vào `packages/`, hoặc để worker gọi một endpoint nội bộ của gateway | |
| 4 | Có giữ một trạng thái `SKIPPED` không | Không thêm giá trị mới. Nếu cần: chỉ dùng cho "giảng viên chủ động tắt AST ở assignment đó", không dùng cho lỗi | Thịnh đồng ý bỏ `SKIPPED` cho lỗi cú pháp và lỗi server (08/10); chờ An |
| 5 | `NEEDS_REVIEW` khi nào | Khi engine trả 200 mà có `warnings` hoặc `fallback_reason` khác `null` (§3) | Thịnh đồng ý (08/10); chờ An |
| 6 | Mở/đóng quyền gọi engine | Engine **chưa có xác thực**: chỉ cho chạy trong mạng nội bộ (docker-compose). Nếu mở ra ngoài thì thêm API key ở header | |
| 7 | Lớp rất đông (hàng trăm bài) | `/compare/batch` đủ cho lớp nhỏ; lớp lớn cần endpoint "một-với-nhiều" (Nhật làm sau) | |
| 8 | Giao tiếp Worker ↔ Gateway nếu worker là service riêng | Endpoint nội bộ `POST /internal/ast/check` nhận `{ submissionId }`, trả `{ status, similarityPercent, isPlagiarism, matchedPairs }`. **Lỗi đầu vào → 4xx, lỗi tạm → 5xx** (để BullMQ phân biệt được). Gọi lại với cùng `submissionId` phải **an toàn** (upsert, không nhân đôi). Timeout phía worker **lớn hơn tổng** timeout gateway→engine (§4), nếu không worker retry khi gateway vẫn đang xử lý. Chỉ cho gọi nội bộ (có token, không lộ ra trình duyệt). Nếu worker nằm cùng tiến trình với gateway thì bỏ endpoint này, gọi thẳng hàm `check()` | |

---

## 8. Nghiệm thu

Chạy bằng Swagger (`http://localhost:8000/docs`), hoặc viết thành test dùng `astClient`. File mẫu nằm ở `apps/ast-engine/tests/fixtures/plagiarism/`: `base_sorting.java`, `variant_l1_rename.java`, `variant_l2_comments.java`, `variant_l3_reorder.java`, `unrelated_linkedlist.java`. Với `/compare`, lấy object `fingerprint` từ `/analyze` rồi dán vào.

| # | Việc | Kết quả mong đợi |
|---|---|---|
| T1 | `GET /health` | 200 |
| T2 | `/analyze` với `base_sorting.java` | `analysis_mode = ast`, `parse_ok = true`, `fallback_reason = null`, `warnings = []` |
| T3 | So `base_sorting` với từng file `variant_l1/l2/l3` | `similarity_percent` ≈ 100 (tối thiểu > 80), `level = DANGER`, `flag = PLAGIARISM_DETECTED`, `mode = ast` |
| T4 | So `base_sorting` với `unrelated_linkedlist` | `level = SAFE`, `flag = null` |
| T5 | `/analyze` với `base_sorting` + dòng thừa ` int int int ;;; {{{ @@@` ở cuối | HTTP 200, `analysis_mode = lex`, `fallback_reason = SYNTAX_ERROR`, `warnings` có `SYNTAX_ERROR_FALLBACK_LEX`, `syntax_error_count > 0` |
| T6 | `/analyze` với `class A { }` | 200, `warnings` có `INSUFFICIENT_DATA` |
| T7 | `/analyze` với `source_code` rỗng | 422, `detail` là **danh sách** |
| T8 | `/analyze` với `language = python` | 400, `code = UNSUPPORTED_LANGUAGE` |
| T9 | **Tắt engine**, nộp một bài | Bài vẫn được lưu; worker thử lại đủ số lần cấu hình; `ast_check_status = FAILED`; giảng viên thấy lỗi |
| T10 | Gateway nộp lại cùng bài | Fingerprint bị ghi đè, không trùng cặp trong `PLAGIARISM_MATCHES` |
| T11 | Hai bài id `9` và `10`, engine trả thứ tự (10, 9) | DB lưu (9, 10) **và** `a_lines`/`b_lines` đã đảo; giảng viên mở đúng đoạn code |
| T12 | Tài khoản sinh viên xem kết quả của mình | Không thấy code hay danh tính bài đối chiếu |

---

## 9. Những điều cần biết

- **`SAFE` không có nghĩa là "chắc chắn không đạo văn".** Engine bắt tốt đổi tên, comment, đảo thứ tự hàm. Với bài bị AI viết lại mạnh (đổi `for` thành `while`, tách hàm, thêm lớp phụ...) thì **chưa đáng tin**: trên dữ liệu mô phỏng chỉ đạt khoảng 25% (mức viết lại vừa) và 11% (mức viết lại mạnh). Giao diện nên ghi kiểu "không phát hiện trùng đáng kể" thay vì "không đạo văn". Số liệu chi tiết ở `reports/recall_baseline.md`.
- Dữ liệu đó là **mô phỏng với mẫu nhỏ**, chưa phải bài của đối thủ thật.
- Kết quả của `/compare` đối xứng (`similarity_percent` không đổi khi đảo hai bài); chỉ `a_lines`/`b_lines` bị đảo.
- `INSUFFICIENT_DATA` cho `similarity_percent = 0`: đừng hiển thị là "0% trùng, an toàn".

## 10. Khi nào hỏi Nhật

- Engine trả kết quả **khác** với §2 hoặc §8 (kèm request, response và phiên bản) — có thể là lỗi của engine hoặc của file này.
- Cần thêm field hoặc endpoint ở engine.
- Muốn đổi ngưỡng, `k`, `window`.
- Nhóm quyết định khác với điểm 6 ở §1 (bỏ qua bài lỗi cú pháp).
