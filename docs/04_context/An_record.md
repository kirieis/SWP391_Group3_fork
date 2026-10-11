# CHI TIẾT THỰC HIỆN TẤT CẢ CÁC GIAI ĐOẠN — DEV 1 (PHÂN HỆ 1: PORTAL & AUTH + API GATEWAY/DB)

- **Dự án:** AITA-INTELLIGENT (Hệ thống chấm bài tự động & Trợ lý Giảng dạy thông minh — SWP391)
- **Phân công cố định:** Dev 1 (An) — Phụ trách Phân hệ 1 (Portal & Auth, Database Gateway, Class & Assignment Management, Submission Ingestion & Appeals Pipeline).
- **Phạm vi hoàn thành:** **100% Toàn bộ các yêu cầu của MILESTONE 2 (Tuần 3 - 5)** và **100% Toàn bộ các yêu cầu của MILESTONE 3 (Tuần 6 - 8)** theo đúng tài liệu `task_milestone_3_10_removenvidia.md` và SRS v1.2.

---

## MỤC LỤC CHI TIẾT

1. [Bảng đối chiếu kiểm tra 100% nhiệm vụ Milestone 2 & 3](#1-bảng-đối-chiếu-kiểm-tra-100-nhiệm-vụ-milestone-2--3)
2. [Chi tiết Giai đoạn 1: Chuẩn hóa & Mở rộng Cơ sở dữ liệu MSSQL Server](#2-chi-tiết-giai-đoạn-1-chuẩn-hóa--mở-rộng-cơ-sở-dữ-liệu-mssql-server)
3. [Chi tiết Giai đoạn 2: Module Xác thực Google SSO & Kiểm soát phân quyền (Auth & Security)](#3-chi-tiết-giai-đoạn-2-module-xác-thực-google-sso--kiểm-soát-phân-quyền-auth--security)
4. [Chi tiết Giai đoạn 3: Phân hệ Quản lý Lớp học & Đề bài tập (Class & Assignment)](#4-chi-tiết-giai-đoạn-3-phân-hệ-quản-lý-lớp-học--đề-bài-tập-class--assignment)
5. [Chi tiết Giai đoạn 4: Đường ống tiếp nhận Bài nộp (Submission Pipeline) & Xử lý Khiếu nại (Appeals)](#5-chi-tiết-giai-đoạn-4-đường-ống-tiếp-nhận-bài-nộp-submission-pipeline--xử-lý-khiếu-nại-appeals)
6. [Chi tiết Giai đoạn 5: API Tổng hợp & Thống kê Giảng viên (Lecturer Analytics)](#6-chi-tiết-giai-đoạn-5-api-tổng-hợp--thống-kê-giảng-viên-lecturer-analytics)
7. [Chi tiết Giai đoạn 6: Thống nhất Giao thức kết nối liên phân hệ (Phân hệ 2, 4, 5) & WebSocket Real-time](#7-chi-tiết-giai-đoạn-6-thống-nhất-giao-thức-kết-nối-liên-phân-hệ-phân-hệ-2-4-5--websocket-real-time)
8. [Chi tiết Giai đoạn 7: Tích hợp Giao diện Frontend React (Vite) & Quản lý Trạng thái](#8-chi-tiết-giai-đoạn-7-tích-hợp-giao-diện-frontend-react-vite--quản-lý-trạng-thái)
9. [Chi tiết Giai đoạn 8: Tích hợp ADR-001 — AST Engine Stateless & Vá Rủi ro Bảo mật](#9-chi-tiết-giai-đoạn-8-tích-hợp-adr-001--ast-engine-stateless--vá-rủi-ro-bảo-mật)
10. [Chi tiết Giai đoạn 10: Chuẩn hóa & Khớp nối Toàn diện Phân hệ 4 (AST Engine Integration)](#10-chi-tiết-giai-đoạn-10-chuẩn-hóa--khớp-nối-toàn-diện-phân-hệ-4-ast-engine-integration)
11. [Chi tiết Giai đoạn 11: Vá Lỗi Luồng E2E & Tách Module ast.service.ts Độc Lập](#11-chi-tiết-giai-đoạn-11-vá-lỗi-luồng-e2e--tách-module-astservicets-độc-lập)

---

## 1. BẢNG ĐỐI CHIẾU KIỂM TRA 100% NHIỆM VỤ MILESTONE 2 & 3

### 🟦 MILESTONE 2 (Tuần 3 - 5) — Core Workflow từng phân hệ:

| Mã công việc / Yêu cầu | Chi tiết kỹ thuật | File hiện thực | Trạng thái |
| :--- | :--- | :--- | :---: |
| **Login SSO (6.7.1)** | Google ID Token verification (`google-auth-library`), chặn domain ngoài `@fpt.edu.vn`/`@fe.edu.vn`, cấp JWT 7 ngày, điều hướng `/dashboard` | `apps/api/src/controllers/auth.controller.ts`<br>`apps/web/src/pages/LoginPage.tsx` | ✅ Đạt 100% |
| **Student Dashboard (6.7.2)** | Danh sách bài tập, Quick Stats bar (tổng bài, đã nộp, điểm TB), bộ lọc trạng thái (`NOT_SUBMITTED`, `SUBMITTED`, `GRADED`) | `apps/web/src/pages/StudentDashboardPage.tsx` | ✅ Đạt 100% |
| **Verify Schema Prisma MSSQL** | Đồng bộ toàn bộ 10+ bảng vào Microsoft SQL Server 2019+ trên cổng `1433` | `apps/api/prisma/schema.prisma` | ✅ Đạt 100% |
| **Model Student/Lecturer/Admin** | Thêm trường thật: `student_code`, `major`, `intake_year`; `department`, `title`, `lecturer_code`; `access_level`, `staff_code`, `managed_scope` | `apps/api/prisma/schema.prisma` | ✅ Đạt 100% |
| **Model ClassStudent** | Thêm `enrolled_at` (DateTime), `status` (`ACTIVE`/`DROPPED`) phục vụ lọc US09 | `apps/api/prisma/schema.prisma` | ✅ Đạt 100% |
| **`POST /api/submissions` (US12)** | Nhận `.zip`, kiểm tra kích thước ≤ 10MB, kiểm tra magic bytes `50 4B 03 04`, băm SHA-256, lưu diskStorage, tạo trạng thái `PENDING`, trả `202 Accepted` | `apps/api/src/controllers/submission.controller.ts`<br>`apps/api/src/routes/submission.routes.ts` | ✅ Đạt 100% |
| **Risk R01** | Chặn nộp bài khi đã đạt giới hạn ≥ 5 lần/bài/sinh viên (dạng config hằng số) | `apps/api/src/controllers/submission.controller.ts` | ✅ Đạt 100% |
| **Quản lý Class CRUD** | Tạo lớp, sửa mã lớp/giảng viên (chống IDOR), xóa lớp (chỉ Admin), danh sách lớp cá nhân | `apps/api/src/controllers/class.controller.ts`<br>`apps/api/src/routes/class.routes.ts` | ✅ Đạt 100% |
| **Import Excel Sinh viên (US06, NFR-12)** | Parse file `.xlsx`, xác thực dòng, dùng **Database Transaction** (`$transaction`) toàn bộ thành công hoặc Rollback | `apps/api/src/controllers/class.controller.ts` | ✅ Đạt 100% |
| **API Assignment + Test Case (US07)** | Tạo đề bài (Java, Python, C#), nhiều test case kèm `score_weight`, tiêu chí chấm | `apps/api/src/controllers/assignment.controller.ts` | ✅ Đạt 100% |
| **Clone Đề bài cũ (UC-02)** | Nhân bản đề bài và toàn bộ test cases từ `sourceAssignmentId` sang lớp mới | `apps/api/src/controllers/assignment.controller.ts` | ✅ Đạt 100% |
| **Thống nhất Format API liên phân hệ** | Endpoint `PATCH /api/submissions/:id/result` có bảo vệ bằng `x-internal-key`, validate dải điểm thang 10 | `apps/api/src/controllers/submission.controller.ts` | ✅ Đạt 100% |

---

### 🟩 MILESTONE 3 (Tuần 6 - 8) — Tích hợp Toàn diện & Semantic Review:

| Mã công việc / Yêu cầu | Chi tiết kỹ thuật | File hiện thực | Trạng thái |
| :--- | :--- | :--- | :---: |
| **Grading Results (6.7.3)** | Stepper 6 bước real-time, 3 Card (Sandbox Test Cases, AI Code Quality, AST Plagiarism 3 vùng màu), Final Score Bar | `apps/web/src/pages/GradingResultsPage.tsx` | ✅ Đạt 100% |
| **Lecturer Dashboard (6.7.4)** | Sidebar điều hướng, 4 card tổng quan, biểu đồ phân bố điểm, tỷ lệ nộp bài, Top 10 nghi vấn đạo văn | `apps/web/src/pages/LecturerDashboardPage.tsx` | ✅ Đạt 100% |
| **Form Appeal (US05, US10)** | Sinh viên gửi lý do khiếu nại, Giảng viên duyệt/từ chối kèm phản hồi | `apps/api/src/controllers/submission.controller.ts`<br>`apps/web/src/pages/GradingResultsPage.tsx` | ✅ Đạt 100% |
| **Risk R03 (Bắt buộc)** | Tự động ghi bản ghi vào bảng `SCORE_AUDIT_LOGS` khi Giảng viên điều chỉnh điểm thủ công | `apps/api/src/controllers/submission.controller.ts` (hàm `resolveAppeal`) | ✅ Đạt 100% |
| **WebSocket Client Real-time** | Tích hợp Socket.io server & helper `emitGradingProgress` cập nhật Stepper không reload | `apps/api/src/socket/index.ts`<br>`apps/api/src/index.ts` | ✅ Đạt 100% |
| **API Dashboard Thống kê (US09)** | Tỷ lệ nộp bài, phân bố điểm theo 4 thang, lọc `status = 'ACTIVE'` (loại `DROPPED`), Top 10 similarity | `apps/api/src/controllers/dashboard.controller.ts`<br>`apps/api/src/routes/dashboard.routes.ts` | ✅ Đạt 100% |
| **Centralized API Service** | Module `apiRequest` tự gắn JWT Bearer, tự động bắt lỗi `401` để logout an toàn | `apps/web/src/services/api.ts` | ✅ Đạt 100% |

---

## 2. CHI TIẾT GIAI ĐOẠN 1: CHUẨN HÓA & MỞ RỘNG CƠ SỞ DỮ LIỆU MSSQL SERVER

### 2.1. Cấu hình Chuỗi kết nối (.env)
File `.env` tại `apps/api/.env` được chuẩn hóa trỏ chính xác về SQL Server Instance trên máy local (Port `1433`):
```dotenv
PORT=5000
DATABASE_URL="sqlserver://localhost:1433;database=aita_db;user=sa;password=12345;trustServerCertificate=true"
JWT_SECRET="aita_jwt_super_secret_key_change_in_production_2026"
GOOGLE_CLIENT_ID="your_google_client_id.apps.googleusercontent.com"
INTERNAL_API_KEY="aita_internal_secret_key_2026"
```

---

## 8. CHI TIẾT GIAI ĐOẠN 8: TÍCH HỢP ADR-001 — AST ENGINE STATELESS & VÁ RỦI RO BẢO MẬT

- **Ngày thực hiện:** 2026-10-05
- **Nguồn gốc:** Review `docs/05_plan/ADR-001-engine-stateless.md` do thành viên phụ trách RBL (Phân hệ 4) đề xuất. Dev 1 (An) đánh giá rủi ro và hiện thực hóa phần gateway.
- **Files thay đổi:**
  - `apps/api/src/services/ast.client.ts` (**TẠO MỚI**)
  - `apps/api/src/controllers/submission.controller.ts` (sửa đổi)
  - `apps/api/prisma/schema.prisma` (sửa đổi — thêm cột, thêm unique constraint)
  - `apps/api/prisma/migrations/migration_lock.toml` (sửa đổi — fix Prisma v5 provider name)

---

### 9.1. Đánh giá Rủi ro ADR-001

| Risk ID | Mô tả | Mức độ | Trạng thái |
| :--- | :--- | :---: | :---: |
| **R-ADR-1** | `AST_CHECK_STATUS` chưa có trong Prisma schema → runtime crash khi thêm cột | 🔴 Cao | ✅ Đã vá |
| **R-ADR-2** | AST flow gọi đồng bộ (`await`) chặn response `submitAssignment` — SV chờ 5–15s | 🔴 Cao | ✅ Đã vá |
| **R-ADR-3** | `getSubmissionResult` lộ `matched_fragments` & `submission_id` bài đối chiếu cho STUDENT | 🟠 Trung bình | ✅ Đã vá |
| **R-ADR-4** | Không có `astClient` wrapper — thay đổi URL engine phải sửa nhiều nơi | 🟡 Thấp | ✅ Đã vá |

---

### 9.2. Fix R-ADR-4: Tạo `astClient` wrapper (ADR-001 §6)

**File:** `apps/api/src/services/ast.client.ts`

Tạo module wrapper duy nhất bao bọc toàn bộ lời gọi HTTP đến Python FastAPI engine. Module này:
- Định nghĩa kiểu TypeScript đầy đủ cho 3 endpoint: `ASTAnalyzeResult`, `ASTCompareResult`, `ASTBatchResult`.
- Implements hàm `engineFetch<T>()` nội bộ với `AbortController` timeout 10 giây (ADR-001 §6: lớn hơn ngân sách 5s của engine).
- Phân biệt lỗi 4xx (không retry, trả `undefined`) và 5xx (ném lỗi để caller có thể retry).
- Export 3 hàm public: `astClient.analyze()`, `astClient.compare()`, `astClient.compareBatch()`.
- URL engine đọc từ biến môi trường `AST_ENGINE_URL` (mặc định `http://localhost:8000`).

```typescript
// Ví dụ sử dụng:
const result = await astClient.analyze(submissionId, sourceCode);
if (!result) { /* Engine lỗi, không chặn bài nộp */ }
```

---

### 9.3. Fix R-ADR-1: Thêm `astCheckStatus` vào Prisma Schema

**File:** `apps/api/prisma/schema.prisma` — Model `Submission`

```prisma
// Thêm vào model Submission:
astCheckStatus String @default("PENDING") @map("ast_check_status")
// Giá trị hợp lệ: PENDING | DONE | FAILED | NEEDS_REVIEW
```

Ý nghĩa từng trạng thái:

| Giá trị | Điều kiện |
| :--- | :--- |
| `PENDING` | Mới nộp, chưa kiểm tra AST |
| `DONE` | Engine trả kết quả thành công |
| `FAILED` | Engine lỗi / timeout (bài nộp vẫn hợp lệ) |
| `NEEDS_REVIEW` | Engine dùng fallback LEX, giảng viên cần xem tay |

**File:** `apps/api/prisma/schema.prisma` — Model `PlagiarismMatch`

Thêm `@@unique([submission1Id, submission2Id])` để đảm bảo upsert idempotent khi retry (ADR-001 §5: luôn lưu id nhỏ trước).

**Kết quả apply:**
```
npx prisma db push → Your database is now in sync with your Prisma schema. Done in 292ms
npx prisma generate → Generated Prisma Client (v5.22.0)
```

---

### 9.4. Fix R-ADR-2: AST chạy bất đồng bộ trong Background

**File:** `apps/api/src/controllers/submission.controller.ts`

**Hàm mới:** `runASTCheckInBackground(submissionId, assignmentId, filePath): Promise<void>`

Hàm này thực thi toàn bộ Flow M2 của ADR-001 §6, **KHÔNG được `await`** từ phía `submitAssignment`. Dùng `setImmediate()` để đảm bảo HTTP response `202 Accepted` được gửi trước khi task background bắt đầu.

**Flow đầy đủ 8 bước:**

```
setImmediate(runASTCheckInBackground)
  ├─ Bước 1: Đọc source code từ file .zip đã lưu trên disk
  ├─ Bước 2: POST /analyze → ASTAnalyzeResult (timeout 10s)
  │    └─ Engine lỗi → astCheckStatus = FAILED, RETURN (bài nộp OK)
  ├─ Bước 3: upsert ASTFingerprint vào DB
  │    └─ Kiểm tra warnings → needsManualReview flag
  ├─ Bước 4: Đọc fingerprint các bài cùng assignment (loại bài vừa nộp)
  ├─ Bước 5: POST /compare/batch với toàn bộ fingerprint
  ├─ Bước 6: Filter cặp có bài mới → upsert PLAGIARISM_MATCHES
  │    └─ Sort submission IDs (id nhỏ trước) → tránh duplicate A-B / B-A
  ├─ Bước 7: Cặp DANGER + PLAGIARISM_DETECTED:
  │    ├─ $transaction: status = SCORE_WITHHELD
  │    ├─ $transaction: ghi ScoreAuditLog (editorId = "system", Risk R03)
  │    └─ emitGradingProgress(AST_CHECK) → WebSocket báo SV
  └─ Bước 8: astCheckStatus = DONE / NEEDS_REVIEW
       └─ emitGradingProgress(AST_CHECK, 100%)
```

**Tác động đến UX:** Sinh viên nhận `202` ngay lập tức. Kết quả AST xuất hiện qua WebSocket sau vài giây (tùy kích thước class).

---

### 9.5. Fix R-ADR-3: Lọc Dữ liệu Plagiarism theo Role (ADR-001 §8)

**File:** `apps/api/src/controllers/submission.controller.ts` — hàm `getSubmissionResult`

**Trước khi fix:** Response trả `plagiarismMatches1` và `plagiarismMatches2` đầy đủ cho mọi role, kể cả STUDENT.

**Sau khi fix:**

| Trường trong response | STUDENT | LECTURER / ADMIN |
| :--- | :---: | :---: |
| `id` (match record) | ✅ | ✅ |
| `similarityPercent` | ✅ | ✅ |
| `submission1Id` | ❌ Ẩn | ✅ |
| `submission2Id` | ❌ Ẩn | ✅ |
| `matchedFragments` | ❌ Ẩn | ✅ |
| `fingerprint` (raw) | ❌ Ẩn | ✅ |

Kiểm tra IDOR bổ sung: STUDENT chỉ được xem bài của chính mình (so sánh `ownerCheck.studentId` với `req.user.userId`), trả `403` nếu không khớp.

---

### 9.6. Tóm tắt File Thay đổi

| File | Loại | Thay đổi chính |
| :--- | :---: | :--- |
| `apps/api/src/services/ast.client.ts` | ✨ Mới | Wrapper HTTP cho AST Engine (ADR-001 §6) |
| `apps/api/src/controllers/submission.controller.ts` | ✏️ Sửa | Import astClient, hàm background, fix IDOR, lọc plagiarism, đảo a_lines/b_lines |
| `apps/api/prisma/schema.prisma` | ✏️ Sửa | Thêm `astCheckStatus`, `@@unique` PlagiarismMatch |
| `apps/api/prisma/migrations/migration_lock.toml` | ✏️ Fix | Cập nhật provider Prisma v5 `sqlserver` → `mssql` |
| `docker-compose.yml` | ✏️ Sửa | Khai báo service `ast-engine` lắng nghe trên cổng `8000` |

---

## 10. CHI TIẾT GIAI ĐOẠN 10: CHUẨN HÓA & KHỚP NỐI TOÀN DIỆN PHÂN HỆ 4 (AST ENGINE INTEGRATION)

- **Ngày cập nhật:** 2026-10-08
- **Tài liệu căn cứ:** `HUONG_DAN_TICH_HOP_AST_ENGINE.md` do Nhật (Phân hệ 4 — AST Plagiarism Detection) gửi cho An (Dev 1).

### 10.1. Chốt danh sách quyết định tích hợp Phân hệ 4

| # | Hạng mục | Quyết định chốt | Hiện thực phía Backend Gateway (`apps/api`) |
| :---: | :--- | :--- | :--- |
| 1 | **Port & Service Domain** | AST Engine cố định tại **Port `8000`** (`http://localhost:8000`) | Đọc qua `AST_ENGINE_URL` trong `ast.client.ts`. Đã khai báo service `ast-engine` cổng `8000` trong `docker-compose.yml`. |
| 2 | **Bài nộp lỗi cú pháp (Syntax Error)** | Engine không đánh `SKIPPED`, tự rơi về chế độ `lex` | Cập nhật DB trạng thái `astCheckStatus = 'NEEDS_REVIEW'` để cảnh báo Giảng viên bài có độ tin cậy thấp. |
| 3 | **Hoán đổi thứ tự dòng (`matched_fragments`)** | Khi ID 1 > ID 2 (bị đảo do `.sort()`), phải đảo vị trí dòng tương ứng | Trong `submission.controller.ts`, kiểm tra `isReversed`: hoán đổi `a_lines` ↔ `b_lines` trong `matched_fragments` trước khi ghi DB. Giảng viên xem chi tiết luôn soi đúng dòng code của bài nộp. |
| 4 | **IDOR & Security** | Sinh viên xem kết quả bị ẩn ID đối chiếu & raw fragments | Kiểm tra role `STUDENT` trong `getSubmissionResult`: chỉ trả về `similarityPercent`, ẩn toàn bộ thông tin mã nguồn bài đối chiếu. |
| 5 | **Đơn vị xử lý Client duy nhất** | Toàn bộ các cuộc gọi HTTP đi qua `astClient` | Tập trung xử lý AbortController timeout (10s), ném exception cho 5xx/lỗi mạng để BullMQ retry, bỏ qua 4xx. |

### 10.2. Cập nhật bảng kiểm soát công việc Phân hệ 1 (Section 4 — Việc của An)

- [x] Giữ `ast.client.ts` là **client duy nhất**, phân biệt 4xx (không retry) và 5xx (ném lỗi).
- [x] Timeout Gateway `10s` cho `/analyze` (lớn hơn ngân sách 5s của Engine).
- [x] Tách luồng kiểm tra AST bất đồng bộ background qua `setImmediate` không block HTTP request `202 Accepted`.
- [x] Chuẩn hóa ID bài nộp nhỏ đứng trước (`.sort()`) + **hoán đổi `a_lines` và `b_lines` khi ID 1 > ID 2**.
- [x] Xử lý khi sinh viên nộp lại bài: dùng `upsert` trên constraint `@@unique([submission1Id, submission2Id])`.
- [x] Khai báo service `ast-engine` cổng `8000` vào `docker-compose.yml`.
- [x] Chặn IDOR: Ẩn thông tin bài làm trùng lặp khi người truy vấn có quyền `STUDENT`.

---

## 11. CHI TIẾT GIAI ĐOẠN 11: VÁ LỖI LUỒNG E2E & TÁCH MODULE AST.SERVICE.TS ĐỘC LẬP

- **Ngày cập nhật:** 2026-10-11
- **Tài liệu căn cứ:** `AN_LOI_PHAT_HIEN_E2E.md` do Nhật (Phân hệ 4) rà soát mã nguồn Gateway.

### 11.1. Các lỗi E2E được chỉ ra và giải pháp kỹ thuật đã triển khai

| # | Mức độ | Vấn đề phát hiện | Giải pháp kỹ thuật đã thực hiện (An) |
|:---:|:---:|:---|:---|
| **1** | **Chặn luồng (Blocker)** | File bài nộp là `.zip` nhị phân nhưng `ast.service.ts` đọc text thô `utf-8` → Engine nhận rác nhị phân, rơi về `lex`, không bao giờ bắt được đạo văn. | Cài đặt `adm-zip` và `@types/adm-zip`. Viết hàm `extractJavaSourceFromZip()`: giải nén an toàn trong bộ nhớ, lọc file `.java`, loại bỏ `package`/`import` khi ghép file để tránh lỗi cú pháp ANTLR giả, chống zip-bomb (giới hạn 5MB uncompressed) và chống path traversal (`..`), giới hạn ≤ 100.000 ký tự cho Engine. |
| **2** | **Nghiêm trọng (Critical)** | So sánh bài nộp cũ không loại trừ bài của chính sinh viên đó (`studentId`) → Khi nộp lại bài bị so khớp 100% với lần nộp trước của mình, dính cờ `DANGER` oan. | Bổ sung điều kiện `studentId: { not: submission.studentId }` vào câu truy vấn `findMany`. Đồng thời lọc Map theo `studentId` chỉ lấy bài nộp mới nhất của từng sinh viên khác, tránh phình dữ liệu bảng `plagiarism_matches`. |
| **3** | **Cân nhắc (Improvement)** | Khi phát hiện `DANGER`, hệ thống tự ý gán `newScore = 0` vào `ScoreAuditLog` trước khi Giảng viên thẩm định. | Điều chỉnh: Đặt trạng thái `SCORE_WITHHELD` (tạm giữ điểm) và ghi log kiểm toán nêu rõ lý do giữ điểm, giữ nguyên điểm số hiện có chờ Giảng viên xác nhận (không tự động ép về 0). |
| **4** | **Nhỏ (API Payload)** | `astClient.compare()` gửi `submission_a`/`submission_b` lệch hợp đồng FastAPI (§2.2). | Đổi thành `submission_1` và `submission_2` trong payload của `engineFetch("/compare")`. |
| **5** | **Kiến trúc (Routing)** | Endpoint nội bộ cho Worker cần thống nhất vị trí. | Mở song song endpoint chuẩn ADR-001: `POST /api/internal/submissions/:id/ast-check` và `POST /api/submissions/internal/:id/ast-check`, bảo vệ qua middleware `requireInternalApiKey` với header `x-internal-key`. |

### 11.2. Tổng kết các module & file đã cập nhật

| File | Hành động | Nội dung thay đổi |
|:---|:---:|:---|
| `apps/api/package.json` | 📦 Cập nhật | Cài đặt thư viện `adm-zip` và `@types/adm-zip` |
| `apps/api/src/services/ast.service.ts` | ✏️ Sửa | Tích hợp giải nén zip, lọc sinh viên khác, xử lý audit log DANGER |
| `apps/api/src/services/ast.client.ts` | ✏️ Sửa | Khớp field `submission_1`/`submission_2` cho route `/compare` |
| `apps/api/src/routes/submission.routes.ts` | ✏️ Sửa | Bổ sung endpoint nội bộ `/internal/:submissionId/ast-check` có bảo vệ key |
| `apps/api/src/index.ts` | ✏️ Sửa | Mount alias `/api/internal/submissions` hỗ trợ chuẩn REST ADR-001 |
| `apps/api/prisma/schema.prisma` | ✏️ Sửa | Thêm `level`, `mode` (`PlagiarismMatch`) & `analysis_mode`, `fallback_reason`, `warnings` (`ASTFingerprint`) |
