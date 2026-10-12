# 🚀 Hướng Dẫn Chạy Project AITA-Intelligent

> **SWP391 – Group 3 · Milestone 3**  
> Nền tảng Trợ lý Giảng dạy & Phát hiện Đạo văn tích hợp Phân tích Cú pháp AST

---

## 📋 Yêu Cầu Hệ Thống (Prerequisites)

| Công cụ | Phiên bản tối thiểu | Kiểm tra |
|:--------|:-------------------:|:--------:|
| **Node.js** | 18+ | `node --version` |
| **npm** | 9+ | `npm --version` |
| **SQL Server** | 2019+ | SSMS hoặc `sqlcmd` |
| **Python** (AST Engine) | 3.10+ | `python --version` |
| **Git** | Bất kỳ | `git --version` |

> 💡 Nếu chưa cài Node.js: [https://nodejs.org](https://nodejs.org) → LTS version

---

## 🗂️ Cấu Trúc Project

```
SWP391_Group3/
├── apps/
│   ├── api/          ← Backend Express + TypeScript (Port 5000)
│   ├── web/          ← Frontend React + Vite (Port 3000)
│   └── ast-engine/   ← Python FastAPI phân tích AST (Port 8000)
├── docs/
│   ├── 04_context/   ← Context records (An_record.md, v.v.)
│   ├── 06_Tutorial/  ← Hướng dẫn (file này)
│   └── ieee-paper/   ← Bài báo khoa học
└── package.json      ← Root monorepo
```

---

## ⚡ Khởi Động Nhanh (Quick Start)

Cần **3 terminal** chạy song song:

### Terminal 1 — Backend API (Port 5000)

```bash
cd apps/api
npm install          # Chỉ cần chạy lần đầu
npm run dev
```

✅ Thành công khi thấy:
```
Server running on port 5000
Database connected successfully
```

---

### Terminal 2 — Frontend Web (Port 3000)

```bash
cd apps/web
npm install          # Chỉ cần chạy lần đầu
npm run dev
```

✅ Thành công khi thấy:
```
VITE v8.x.x  ready in xxx ms
➜  Local:   http://localhost:3000/
```

---

### Terminal 3 — AST Engine / Python (Port 8000) *(tùy chọn)*

```bash
cd apps/ast-engine
pip install -r requirements.txt    # Lần đầu
python main.py
```

✅ Thành công khi thấy:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

---

## 🗃️ Cấu Hình Database (SQL Server)

### Bước 1: Tạo Database

Mở SSMS (SQL Server Management Studio) và chạy:
```sql
CREATE DATABASE aita_db;
```

### Bước 2: Cấu hình `.env` cho Backend

Tạo file `apps/api/.env` (copy từ `.env.example` nếu có):

```env
PORT=5000
DATABASE_URL="sqlserver://localhost:1433;database=aita_db;user=sa;password=YOUR_PASSWORD;trustServerCertificate=true"
JWT_SECRET="aita_jwt_super_secret_key_change_in_production"
GOOGLE_CLIENT_ID="your_google_client_id.apps.googleusercontent.com"
```

> ⚠️ Thay `YOUR_PASSWORD` bằng mật khẩu SQL Server của bạn.

### Bước 3: Chạy Migrations (Prisma)

```bash
cd apps/api
npx prisma db push      # Tạo bảng từ schema
npx prisma generate     # Generate Prisma Client
```

---

## 🔐 Cấu Hình Google OAuth (Bắt buộc để đăng nhập thật)

Hiện tại project có **2 chế độ đăng nhập**:

### Chế độ Dev (Mặc định — Không cần Google)

Nếu chưa cấu hình Google Client ID, hệ thống tự động vào **Dev Mode**:
- Banner vàng hiển thị ở trang Login
- Click nút → đăng nhập ngay bằng tài khoản giả lập
- `student.dev@fpt.edu.vn` (Sinh viên) / `lecturer.dev@fe.edu.vn` (Giảng viên)

> ✅ Dùng cho việc phát triển tính năng, không cần setup Google

---

### Chế độ Production (Google OAuth Thật) — **Khuyến nghị khi demo**

#### Bước 1: Tạo Google OAuth Client ID

1. Vào [Google Cloud Console](https://console.cloud.google.com/)
2. Chọn project (hoặc tạo mới) → **APIs & Services** → **Credentials**
3. Click **Create Credentials** → **OAuth 2.0 Client ID**
4. Application type: **Web application**
5. Đặt tên: `AITA-Intelligent`
6. Thêm **Authorized JavaScript origins**:
   ```
   http://localhost:3000
   ```
7. Click **Create** → Copy **Client ID** (dạng: `123456789-abc...xyz.apps.googleusercontent.com`)

#### Bước 2: Cấu hình Frontend

Tạo/sửa file `apps/web/.env`:
```env
VITE_GOOGLE_CLIENT_ID=123456789-abc...xyz.apps.googleusercontent.com
VITE_API_URL=http://localhost:5000/api
```

#### Bước 3: Cấu hình Backend

Sửa file `apps/api/.env`:
```env
GOOGLE_CLIENT_ID=123456789-abc...xyz.apps.googleusercontent.com
```

#### Bước 4: Restart Frontend

```bash
# Trong terminal apps/web — bấm Ctrl+C rồi:
npm run dev
```

#### Bước 5: Test Đăng Nhập

1. Mở `http://localhost:3000`
2. Banner "Dev Mode" biến mất
3. Click **"Đăng nhập với Google — Sinh viên"**
4. Popup chọn tài khoản Google hiện ra
5. Chọn tài khoản `@fpt.edu.vn` → ✅ Vào `/dashboard`
6. Chọn tài khoản `@gmail.com` → ❌ Lỗi "Vui lòng dùng tài khoản FPT Education"

---

## 👤 Phân Quyền Người Dùng

| Email Domain | Role | Trang sau đăng nhập |
|:-------------|:----:|:-------------------:|
| `@fpt.edu.vn` | STUDENT | `/dashboard` |
| `@fe.edu.vn` | LECTURER | `/lecturer/dashboard` |
| Khác | — | Lỗi 403 |

---

## 🌐 Port Map

| Service | Port | URL | Trạng thái |
|:--------|:----:|:----|:----------:|
| Frontend (React) | **3000** | http://localhost:3000 | Bắt buộc |
| Backend (Express) | **5000** | http://localhost:5000/api | Bắt buộc |
| AST Engine (Python) | **8000** | http://localhost:8000 | Tùy chọn |

---

## 🛑 Lỗi Thường Gặp & Cách Xử Lý

### ❌ `Cannot connect to server (Port 5000)`
- Đảm bảo backend đang chạy: `cd apps/api && npm run dev`
- Kiểm tra `DATABASE_URL` trong `apps/api/.env` đúng chưa
- SQL Server phải đang chạy: Mở SSMS → kiểm tra server status

### ❌ `Popup blocked` khi đăng nhập Google
- Trình duyệt chặn popup → Click biểu tượng popup bị chặn trên thanh địa chỉ → Allow
- Hoặc vào Settings → Popup and redirects → Cho phép `localhost:3000`

### ❌ `Google Client ID not valid`
- Kiểm tra lại `VITE_GOOGLE_CLIENT_ID` trong `apps/web/.env`
- Đảm bảo đã thêm `http://localhost:3000` vào **Authorized JavaScript origins** trong Google Cloud Console
- Restart frontend sau khi sửa `.env`

### ❌ `prisma db push` lỗi
- Kiểm tra SQL Server đang chạy và `DATABASE_URL` đúng
- Đảm bảo database `aita_db` đã được tạo
- Với SQL Server local: dùng `trustServerCertificate=true` trong connection string

### ❌ `Module not found: @react-oauth/google`
```bash
cd apps/web
npm install
```

### ❌ Banner "Dev Mode" vẫn hiện sau khi cấu hình Client ID
- Kiểm tra file `apps/web/.env` đúng tên (không phải `.env.local` hay `.env.development`)
- Giá trị `VITE_GOOGLE_CLIENT_ID` không bắt đầu bằng `your_google_client_id`
- **Bắt buộc restart** `npm run dev` sau khi sửa `.env`

---

## 📝 Chạy Lần Đầu — Checklist

```
[ ] Node.js 18+ đã cài
[ ] SQL Server đang chạy, database aita_db đã tạo
[ ] apps/api/.env đã cấu hình DATABASE_URL, JWT_SECRET, GOOGLE_CLIENT_ID
[ ] apps/web/.env đã tạo với VITE_GOOGLE_CLIENT_ID
[ ] cd apps/api && npm install && npx prisma db push && npm run dev
[ ] cd apps/web && npm install && npm run dev
[ ] Mở http://localhost:3000 — trang Login hiện ra
[ ] (Tùy chọn) cd apps/ast-engine && python main.py
```

---

## 🔧 Scripts Hữu Ích

```bash
# Reset database (XÓA TẤT CẢ DỮ LIỆU)
cd apps/api
npx prisma db push --force-reset

# Xem database trong browser
npx prisma studio

# Build production frontend
cd apps/web
npm run build

# Kiểm tra TypeScript backend (0 errors)
cd apps/api
npx tsc --noEmit

# Chạy stress test (cần k6 cài sẵn)
k6 run docs/stress-test/k6_submission_stress.js
```

---

## 📞 Liên Hệ Nhóm

| Vai trò | Phụ trách |
|:--------|:----------|
| Backend + Auth + DB | An (Phan he 1) |
| AST Analysis + Plagiarism | Nhật + Huy |
| Frontend UI | Thiện + Thịnh |

> 📄 Xem chi tiết tiến độ: [`docs/04_context/An_record.md`](../04_context/An_record.md)
