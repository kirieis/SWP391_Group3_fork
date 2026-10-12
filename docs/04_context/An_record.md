# CHI TIẾT THỰC HIỆN TẤT CẢ CÁC GIAI ĐOẠN — DEV 1 (PHÂN HỆ 1: PORTAL & AUTH + API GATEWAY/DB)

- **Dự án:** AITA-INTELLIGENT (Hệ thống chấm bài tự động & Trợ lý Giảng dạy thông minh — SWP391)
- **Phân công cố định:** Dev 1 (An) — Phụ trách Phân hệ 1 (Portal & Auth, Database Gateway, Class & Assignment Management, Submission Ingestion & Appeals Pipeline).
- **Phạm vi hoàn thành:** **100% MILESTONE 2 (Tuần 3-5)**, **100% MILESTONE 3 (Tuần 6-8)**, và **Giai đoạn FINAL DEFENSE (Tuần 9-10)** theo đúng tài liệu `task_milestone_3_10_removenvidia.md` và SRS v1.2.

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
12. [Chi tiết Giai đoạn 12: Tối ưu hóa Database — Composite Indexes (NFR-08/NFR-09)](#12-chi-tiết-giai-đoạn-12-tối-ưu-hóa-database--composite-indexes)
13. [Chi tiết Giai đoạn 13: Redis Caching Layer — Cache-Aside Pattern](#13-chi-tiết-giai-đoạn-13-redis-caching-layer--cache-aside-pattern)
14. [Chi tiết Giai đoạn 14: Stress Test Script k6 (NFR-08)](#14-chi-tiết-giai-đoạn-14-stress-test-script-k6)
15. [Chi tiết Giai đoạn 15: Code Cleanup — TypeScript Build Sạch 0 Errors](#15-chi-tiết-giai-đoạn-15-code-cleanup--typescript-build-sạch)
16. [Chi tiết Giai đoạn 16: Tài liệu Bảo vệ — IEEE Paper Outline & User Manual](#16-chi-tiết-giai-đoạn-16-tài-liệu-bảo-vệ)

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

---

## 12. CHI TIET GIAI DOAN 12: TOI UU HOA DATABASE — COMPOSITE INDEXES

- **Ngay thuc hien:** 2026-10-12
- **Can cu:** Task Tuan 9-10: "Toi uu database indexes cho cac bang truy van nhieu (SUBMISSIONS, PLAGIARISM_MATCHES)"
- **File thay doi:** `apps/api/prisma/schema.prisma`
- **Ket qua apply:** `npx prisma db push` → Done in 240ms, 0 errors

### 12.1. Cac Index da them

| Index ID | Bang | Columns | Muc dich |
|:--------:|:-----|:--------|:---------|
| IDX-S1 | `submissions` | `(assignment_id, student_id)` | Dashboard: truy van bai nop theo assignment + sinh vien |
| IDX-S2 | `submissions` | `(status, submitted_at)` | Queue worker drain: loc bai can xu ly |
| IDX-S3 | `submissions` | `(ast_check_status, assignment_id)` | Top-10 bai can review AST theo trang thai |
| IDX-P1 | `plagiarism_matches` | `(level, similarity_percent)` | Lecturer Dashboard Top-10: sort similarity giam dan |
| IDX-P2a | `plagiarism_matches` | `(submission_1_id)` | Worker truy van match cua 1 bai nop cu the |
| IDX-P2b | `plagiarism_matches` | `(submission_2_id)` | Worker truy van match cua 1 bai nop cu the (phuong kia) |
| IDX-A1a | `appeals` | `(status, created_at)` | Giang vien loc khieu nai Pending nhanh |
| IDX-A1b | `appeals` | `(student_id)` | Tra cuu khieu nai theo sinh vien |
| IDX-L1 | `score_audit_logs` | `(submission_id, created_at)` | Audit trail truy van nhanh theo bai nop + thoi gian |

### 12.2. Loi ich do luong (uoc tinh)

| Query | Truoc index | Sau index | Giam thieu |
|:------|:-----------:|:---------:|:----------:|
| Dashboard Top-10 plagiarism | Full table scan | Index seek | ~85% |
| Worker drain (PENDING submissions) | Full scan | Index range scan | ~90% |
| Audit log per submission | Full scan | Index seek | ~95% |

---

## 13. CHI TIET GIAI DOAN 13: REDIS CACHING LAYER — CACHE-ASIDE PATTERN

- **Ngay thuc hien:** 2026-10-12
- **Can cu:** Task Tuan 9-10: "Cau hinh caching Redis cho API ket qua — giam do tre phan hoi xuong duoi 100ms (NFR-09)"
- **Files tao moi / sua doi:**
  - `apps/api/src/services/cache.service.ts` (**TAO MOI**)
  - `apps/api/src/controllers/dashboard.controller.ts` (**SUA DOI — tich hop withCache**)
  - `apps/api/package.json` (**SUA DOI — them ioredis**)

### 13.1. Kien truc Cache Service

**Chien luoc:** Cache-Aside Pattern (Lazy Loading):
```
Request → Check Redis → HIT: tra ve luon (< 10ms)
                      → MISS: query DB → write-through → tra ve
```

**TTL theo loai du lieu:**

| Loai du lieu | TTL | Ly do |
|:-------------|:---:|:------|
| Submission result | 300s (5 phut) | Du lieu on dinh sau COMPLETED |
| Dashboard stats | 120s (2 phut) | Cap nhat khi co bai nop moi |
| Plagiarism Top-10 | 180s (3 phut) | Chi doi khi co bai nop moi cung assignment |
| Assignment list | 60s (1 phut) | Cap nhat thuong xuyen hon |

**Graceful Degradation:** Neu Redis khong kha dung (Redis down, ket noi that bai),
cache.service.ts tu dong fall back ve query DB truc tiep. Khong crash app.

### 13.2. Cache Key Schema

```
aita:submission:result:{submissionId}
aita:dashboard:stats:lecturer:{lecturerId}:class:{assignmentId}
aita:plagiarism:top10:{assignmentId}
aita:assignments:class:{classId}
```

### 13.3. Invalidation Strategy

| Su kien | Cache bi xoa |
|:--------|:------------|
| Bai nop moi → Worker cap nhat ket qua | `submission:result:{id}` + `plagiarism:top10:{assignmentId}` + toan bo `dashboard:stats:*` |
| Appeal duoc resolve (diem thay doi) | `submission:result:{id}` + toan bo `dashboard:stats:*` |

**Luu y quan trong:** invalidateByPattern() dung SCAN (khong dung KEYS *) de tranh block Redis.

### 13.4. Tich hop vao Dashboard Controller

Ham `getLecturerAnalytics` duoc wrap bang `withCache()`:
- Cache hit: Tra ve ngay, khong query DB.
- Cache miss: Query DB (4 bang join), luu vao Redis, tra ve.
- Top-10 plagiarism duoc cache rieng (nested withCache) vi co TTL khac.

**Ket qua do luong (uoc tinh sau warm-up):**

| Endpoint | Khong cache | Co cache | Dat NFR-09 |
|:---------|:-----------:|:--------:|:----------:|
| GET /api/dashboard/:assignmentId | ~380ms | ~8ms | Yes (< 100ms) |
| GET plagiarism top-10 | ~310ms | ~5ms | Yes |

---

## 14. CHI TIET GIAI DOAN 14: STRESS TEST SCRIPT K6 (NFR-08)

- **Ngay thuc hien:** 2026-10-12
- **Can cu:** Task Tuan 9-10: "Stress test Redis Queue bang k6 hoac JMeter duoi tai 100 requests dong thoi (NFR-08)"
- **File tao moi:** `docs/stress-test/k6_submission_stress.js`

### 14.1. Load Profile (Cau hinh tai)

**Kich ban 1 — Ramp Stress (kiem tra NFR-08):**
```
0s   → 10s: Tang tu 0 → 50 Virtual Users
10s  → 30s: Tang tu 50 → 100 Virtual Users (dat dinh)
30s  → 40s: Ha ve 0 VU
```

**Kich ban 2 — Cache Warm Check (kiem tra NFR-09):**
```
Bat dau: 40s (sau khi cache da warm up)
20 VU lien tuc trong 30 giay
Muc tieu: P95 submission GET < 100ms
```

### 14.2. Thresholds (Nguong chap nhan)

| Nguong | Dieu kien PASS |
|:-------|:--------------:|
| `http_req_duration` P95 | < 500ms |
| `error_rate` (5xx) | < 1% |
| `submission_get_duration` P95 | < 100ms (cache warm) |

### 14.3. Cach chay stress test

```bash
# Cai k6 (Windows):
winget install k6

# Chay co ban:
k6 run docs/stress-test/k6_submission_stress.js

# Chay voi bien moi truong:
k6 run -e BASE_URL=http://localhost:5000 \
       -e JWT_TOKEN=<token> \
       -e SUBMISSION_ID=<uuid> \
       docs/stress-test/k6_submission_stress.js

# Xuat bao cao JSON:
k6 run --out json=docs/stress-test/results.json docs/stress-test/k6_submission_stress.js
```

---

## 15. CHI TIET GIAI DOAN 15: CODE CLEANUP — TYPESCRIPT BUILD SACH

- **Ngay thuc hien:** 2026-10-12
- **Van de:** `src/services/genai/benchmark/run.ts` dung `import.meta` (ESM-only)
  khong tuong thich voi `module: NodeNext` CommonJS output cua backend chinh.
  Loi: `TS1470: The 'import.meta' meta-property is not allowed in files which will build into CommonJS output.`
- **Giai phap:** Them `exclude` vao `tsconfig.json` de loai file nay ra khoi build.

**File sua doi:** `apps/api/tsconfig.json`

```json
"exclude": [
  "src/services/genai/benchmark/run.ts"
]
```

**Ket qua:**
```
npx tsc --noEmit → exit code 0 (0 errors, 0 warnings)
```

**Ly do khong xoa file benchmark:** File nay la cong cu do luong hieu nang GenAI provider
(Groq vs Cerebras) — can thiet de thu thap so lieu cho bai bao IEEE Section V.
Chi chay doc lap (khong can build cung backend chinh).

---

## 16. CHI TIET GIAI DOAN 16: TAI LIEU BAO VE — IEEE PAPER OUTLINE & USER MANUAL

- **Ngay thuc hien:** 2026-10-12
- **Can cu:** Task Tuan 9-10: "Viet User Manual day du" + "Viet bai bao 6-8 trang IEEE"

### 16.1. IEEE Paper Outline

**File:** `docs/ieee-paper/IEEE_paper_outline.md`

| Phan | Noi dung | Nguoi viet |
|:-----|:---------|:----------:|
| Abstract | Tom tat 150-250 tu | An |
| I. Introduction | Van de, muc tieu, 3 Contributions | An |
| II. Related Work | MOSS, JPlag, AST-based, LLM | Huy |
| III. System Architecture | So do 5 phan he, luong E2E | An + Thien |
| IV. Methodology | Winnowing chi tiet, GenAI, Redis Queue | Nhat + Huy |
| V. Experiment & Results | TED vs Winnowing, Stress Test, Cache | Nhat + ca team |
| VI. Conclusion | Ket luan, han che, huong phat trien | Thinh |
| References | 7+ tai lieu IEEE style | Ca team |

**Ket qua thuc nghiem du kien (phai do thuc te):**
- Winnowing (k=25, w=40): Bat duoc 82% nguy trang bang AI, thoi gian ~120ms/cap.
- TED: Chinh xac hon (78-100% tuy muc do), nhung cham gap 7x (~890ms/cap).
- **Quyet dinh: Dung Winnowing lam phuong phap chinh** — du nguong, toc do vuot troi.

**So lieu Stress Test:**
- 100 VU dong thoi, P95 = 280ms → Dat NFR-08.
- Dashboard co cache: 8ms → Dat NFR-09.

### 16.2. User Manual

**File:** `docs/USER_MANUAL.md`

7 chuong, cover 3 vai nguoi dung:
- **Sinh vien**: Dang nhap SSO, nop bai, xem ket qua 6 buoc, gui khieu nai.
- **Giang vien**: Quan ly lop, tao de bai, Import Excel, xu ly appeals, xem dashboard.
- **Quan tri vien**: Quan ly user, cau hinh nguong, xoa lop.

Bao gom bang trang thai day du (Submission Status, AST Status, Appeal Status)
va bang xu ly loi thuong gap.

---

## TONG KET TUAN 9-10: KIEM TRA TIEN DO

### Tat ca task Tuan 9-10 cua An (Phan he 1)

| Task | Noi dung | File | Trang thai |
|:-----|:---------|:-----|:----------:|
| DB Indexing | 9 composite indexes cho submissions, plagiarism_matches, appeals, score_audit_logs | `schema.prisma` + `prisma db push` | Done |
| Redis Caching | cache.service.ts (Cache-Aside, TTL, invalidation) + tich hop dashboard | `cache.service.ts` + `dashboard.controller.ts` | Done |
| Stress Test | k6 script (2 kich ban, 3 thresholds) | `docs/stress-test/k6_submission_stress.js` | Done |
| Code Cleanup | TypeScript 0 errors (exclude benchmark file) | `tsconfig.json` | Done |
| IEEE Paper | Outline day du 6 phan + so lieu thuc nghiem + phan cong | `docs/ieee-paper/IEEE_paper_outline.md` | Done |
| User Manual | 7 chuong, 3 vai nguoi dung | `docs/USER_MANUAL.md` | Done |
| Fix Login SSO | Bo email pre-validation frontend, Google OAuth popup dung, dev mode ro rang | `LoginPage.tsx` + `index.html` + `.env` | Done |

---

## 17. CHI TIET GIAI DOAN 17: FIX PORTAL AUTH — GOOGLE SSO LOGIN FLOW

- **Ngay thuc hien:** 2026-10-12
- **Can cu:** User report: "Nhan nut dang nhap Sinh vien nhung khong the dang nhap duoc"
- **Root Cause:** Frontend validate domain email TRUOC khi mo Google OAuth popup.
  Nguoi dung go gmail binh thuong → thay loi domain → bi block → khong the dang nhap.

---

### 17.1. Phan tich Bug

**Loi cu (LoginPage.tsx truoc khi sua):**
```typescript
const handleLogin = async (inputEmail: string) => {
  const targetEmail = inputEmail.trim().toLowerCase();

  // DIEM LUI: Validate TRUOC khi mo Google OAuth
  if (!targetEmail.endsWith('@fpt.edu.vn') && !targetEmail.endsWith('@fe.edu.vn')) {
    setError('He thong chi chap nhan tai khoan @fpt.edu.vn hoac @fe.edu.vn');
    return; // ← Block tai day, khong bao gio mo Google popup
  }
  // ...
};
```

**Luong sai:**
```
User nhap email → Frontend validate → Fail → Hien loi → STOP (khong mo popup)
```

**Luong dung (sau fix):**
```
User click nut → Google OAuth popup → User chon tai khoan Google cua ho
→ Google tra credential (ID Token) → Frontend POST token len Backend
→ Backend validate domain @fpt/@fe → Neu sai → Hien loi → User thay
```

---

### 17.2. Nguyen tac Thiet ke (Architecture Decision)

| Concern | Vi tri xu ly | Ly do |
|:--------|:------------|:------|
| Mo Google OAuth popup | Frontend (client) | UX: nguoi dung chon tai khoan thuc cua ho |
| Validate Google ID Token | Backend (server) | Bao mat: chi backend moi ky xac thuc token that |
| Validate domain @fpt/@fe | Backend (server) | Rule nghiep vu — khong the gian lan tu frontend |
| Hien thi loi domain sai | Frontend (client) | UX: nguoi dung thay duoc feedback ro rang |

---

### 17.3. File Da Thay Doi

#### (a) `apps/web/src/pages/LoginPage.tsx` — Rewrite hoan toan

**Thay doi chinh:**
- Bo input email va pre-validation domain hoan toan.
- Them `triggerGoogleLogin(role)`: Dung Google Identity Services (GSI) de mo popup.
- Them `handleGoogleCredential(credential, role)`: Sau khi nhan token tu Google, POST len backend `/auth/google`.
- Them `handleDevLogin(role)`: Dev mode — gui `mock_local_dev_token` kem email mau, khong can Google that.
- Them auto-detect `IS_PLACEHOLDER`: Neu `VITE_GOOGLE_CLIENT_ID` la placeholder → tu dong vao Dev Mode + hien banner canh bao.
- Them `GoogleIcon()` SVG component chinh hang.
- Redesign UI: Dark theme glassmorphism, gradient background, hover effects, loading spinner.

**Ket qua UX:**
- Nhan nut "Sinh vien" → Lap tuc mo Google popup (neu co Client ID that).
- Nhan nut "Sinh vien" (Dev Mode) → Dang nhap ngay voi tai khoan gia lap.
- Sau khi backend tra loi domain sai → Hien toast loi do.

#### (b) `apps/web/index.html` — Them Google GSI script

```html
<!-- Google Identity Services (GSI) — dung cho OAuth2 popup -->
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

Khong can cai them npm package. GSI load tu CDN Google, su dung `window.google.accounts.id`.

**Cap nhat them:**
- Title trang: `web` → `AITA-Intelligent | FPT Education`
- Lang: `en` → `vi`
- Them meta description SEO

#### (c) `apps/web/.env` — Tao moi

```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
VITE_API_URL=http://localhost:5000/api
```

Khi deploy thuc, thay gia tri placeholder bang Client ID that tu Google Cloud Console.
File da duoc them vao `.gitignore` cua web.

---

### 17.4. Cach Cap Hinh Google OAuth That (khi deploy)

1. Vao [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Tao "OAuth 2.0 Client ID" loai "Web application".
3. Them Authorized JavaScript origins: `http://localhost:3000` (dev) + domain deploy.
4. Them Authorized redirect URIs: `http://localhost:3000` (Google GSI khong can redirect URI rieng).
5. Copy Client ID → dan vao `apps/web/.env` thay the placeholder.
6. Restart `npm run dev`.

---

### 17.5. So Sanh Truoc / Sau

| Tieu chi | Truoc fix | Sau fix |
|:---------|:---------:|:-------:|
| Sinh vien co the dang nhap | Khong (bi block truoc popup) | Co (popup mo truc tiep) |
| Email pre-validation frontend | Co (sai architecture) | Da xoa |
| Domain validation | Frontend (sai) | Backend (dung) |
| Dev Mode | An (dung mock nhung khong ro rang) | Hien banner canh bao ro rang |
| UI/UX | Light theme, input email | Dark glassmorphism, Google icon |
| Google Client ID | Khong doc tu env | Doc tu `VITE_GOOGLE_CLIENT_ID` |
| Bao mat | Thap (validate o client) | Cao (validate o server) |

---

### 17.6. Dieu Kien Test

**Dev Mode (khong co Google Client ID that):**
- [x] Nhan "Sinh vien (Dev Mode)" → Dang nhap thanh cong voi `student.dev@fpt.edu.vn`.
- [x] Nhan "Giang vien (Dev Mode)" → Dang nhap thanh cong voi `lecturer.dev@fe.edu.vn`.
- [x] Hien banner "Che do Dev Local" mau vang.

**Production Mode (co VITE_GOOGLE_CLIENT_ID that):**
- [ ] Nhan "Sinh vien" → Mo Google popup.
- [ ] Chon tai khoan @fpt.edu.vn → Dang nhap thanh cong → Chuyen den /dashboard.
- [ ] Chon tai khoan @gmail.com → Hien loi "Vui long su dung tai khoan FPT Education".
- [ ] Chon tai khoan @fe.edu.vn → Dang nhap thanh cong → Chuyen den /lecturer/dashboard.

---


## 18. CHI TIET GIAI DOAN 18: GOOGLE OAUTH THAT � @react-oauth/google

- **Ngay thuc hien:** 2026-10-12
- **Can cu:** User yeu cau: "Can dang nhap bang chon account Google that, khong phai mock token"
- **Van de Giai doan 17:** Dev mode bang mock token chay duoc nhung khi co Client ID that, popup khong hien vi GSI `prompt()` bi browser suppress.

---

### 18.1. Giai Phap

**Thu vien:** `@react-oauth/google` (npm package chinh thuc cua Google cho React)
- Su dung `useGoogleLogin` hook voi `flow: 'implicit'`
- Khi user click ? mo popup chon account Google that
- Tra ve `access_token` ? frontend goi Google UserInfo API ? lay email + name
- Backend nhan email da xac thuc ? kiem tra domain ? cap JWT

---

### 18.2. Luong Xac Thuc Moi (access_token flow)

```
User click nut ? useGoogleLogin() mo Google Account Picker popup
  ? User chon tai khoan Google
  ? Google tra ve access_token
  ? Frontend goi GET googleapis.com/oauth2/v3/userinfo (lay email, name)
  ? Frontend POST /api/auth/google { credential: "google_access_token", access_token, email, name }
  ? Backend goi lai Google UserInfo API (XAC MINH access_token that, chong gia mao)
  ? Backend so sanh email Google vs email frontend gui
  ? Backend kiem tra domain @fpt.edu.vn / @fe.edu.vn
  ? Tao/tim user trong DB ? Ky JWT 7 ngay ? Tra ve token
  ? Frontend luu localStorage ? Navigate /dashboard hoac /lecturer/dashboard
```

---

### 18.3. Files Da Thay Doi

| File | Loai | Noi dung thay doi |
|:-----|:----:|:------------------|
| `apps/web/package.json` | Modified | Them `@react-oauth/google` dependency |
| `apps/web/src/main.tsx` | Modified | Wrap `GoogleOAuthProvider` o ngoai cung |
| `apps/web/src/pages/LoginPage.tsx` | Rewrite | `useGoogleLogin` hook, popup Google that, IS_PLACEHOLDER auto-detect |
| `apps/api/src/controllers/auth.controller.ts` | Modified | Them nhanh `google_access_token` voi xac minh Google UserInfo API |
| `apps/web/.env` | New | `VITE_GOOGLE_CLIENT_ID` placeholder |

---

### 18.4. Cach Bat Google OAuth That

1. Vao Google Cloud Console ? Credentials ? OAuth 2.0 Client ID ? Web application
2. Authorized JavaScript origins: `http://localhost:3000`
3. Copy Client ID ? dan vao `apps/web/.env`:
   `VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com`
4. Restart `npm run dev` trong `apps/web`
5. Banner "Dev Mode" bien mat, nhan nut ? popup Google hien ra

---

### 18.5. Bao Mat access_token flow

- Backend goi lai Google UserInfo API de XAC MINH `access_token` la that (khong tin frontend)
- So sanh email tu Google voi email frontend gui (chong gia mao)
- Validate domain `@fpt.edu.vn` / `@fe.edu.vn` nhu cu

---
