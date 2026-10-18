# HUONG DAN SU DUNG HE THONG — AITA-INTELLIGENT
**Phien ban:** 1.0 | **Cap nhat:** 2026-10-12 | **Nhom:** SWP391 Nhom 3

---

## MUC LUC
1. [Gioi thieu chung](#1-gioi-thieu-chung)
2. [Dang nhap he thong (SSO)](#2-dang-nhap-he-thong-sso)
3. [Huong dan danh cho Sinh vien (Student)](#3-huong-dan-danh-cho-sinh-vien)
4. [Huong dan danh cho Giang vien (Lecturer)](#4-huong-dan-danh-cho-giang-vien)
5. [Huong dan danh cho Quan tri vien (Admin)](#5-huong-dan-danh-cho-quan-tri-vien)
6. [Giai thich ket qua cham bai](#6-giai-thich-ket-qua-cham-bai)
7. [Xu ly loi thuong gap](#7-xu-ly-loi-thuong-gap)

---

## 1. GIOI THIEU CHUNG

AITA-Intelligent la he thong cham bai lap trinh tu dong danh cho sinh vien FPT University.
He thong ho tro:
- **Chay thu nghiem** (Docker Sandbox): Kiem tra code voi cac test case co san.
- **Phat hien dao van** (AST Winnowing): So sanh ma nguon voi tat ca cac bai nop cung de.
- **Cham diem chat luong code** (GenAI): AI tu dong danh gia Clean Code 0-100 diem.
- **Thong bao real-time** (WebSocket): Cap nhat tung buoc ma khong can tai lai trang.

**Ngon ngu ho tro:** Java | Python | C#

---

## 2. DANG NHAP HE THONG (SSO)

### 2.1 Yeu cau
- Email **@fpt.edu.vn** hoac **@fe.edu.vn** (email ca nhan khong duoc chap nhan).
- Tai khoan Google da duoc kich hoat.

### 2.2 Cac buoc dang nhap
1. Mo trinh duyet, truy cap URL he thong.
2. Nhan nut **"Dang nhap bang Google"**.
3. Chon tai khoan Google **@fpt.edu.vn** hoac **@fe.edu.vn**.
4. He thong tu dong nhan dien quyen han (Sinh vien / Giang vien / Quan tri vien).
5. Duoc chuyen den Dashboard tuong ung.

> **Luu y:** Neu dang nhap bang email khong dung mien, he thong se hien thi
> toast canh bao va tu choi dang nhap.

---

## 3. HUONG DAN DANH CHO SINH VIEN

### 3.1 Xem danh sach bai tap (Student Dashboard)
- Sau khi dang nhap, dashboard hien thi:
  - **Quick Stats**: Tong bai, da nop, chua nop, diem trung binh.
  - **Danh sach bai tap**: Sap xep theo deadline. Co the loc theo trang thai:
    - `NOT_SUBMITTED` — Chua nop
    - `SUBMITTED` — Da nop, dang cho cham
    - `GRADED` — Da co ket qua

### 3.2 Nop bai (US12)
1. Nhan vao ten bai tap muon nop.
2. Nhan nut **"Nop bai"**.
3. Chon file **.zip** chua ma nguon (toi da 10MB).

> **Yeu cau file zip:**
> - Dinh dang: `.zip` (khong ho tro `.rar`, `.7z`)
> - Kich thuoc: Khong qua **10MB**
> - Noi dung: Chua cac file `.java` / `.py` / `.cs`

4. He thong tra ve **202 Accepted** — bai nop dang duoc xu ly.
5. Tren trang ket qua, thanh tien trinh **6 buoc** cap nhat real-time:

| Buoc | Ten | Mo ta |
|:----:|:----|:------|
| 1 | QUEUED | Bai nop da vao hang doi Redis |
| 2 | COMPILING | Dang bien dich trong Docker Sandbox |
| 3 | RUNNING_TESTS | Dang chay cac test case |
| 4 | AST_CHECK | Dang kiem tra dao van AST |
| 5 | AI_REVIEW | AI dang cham Clean Code |
| 6 | COMPLETED | Da co diem chinh thuc |

> **Gioi han nop bai:** Toi da **5 lan** moi bai tap moi sinh vien (co the chinh boi Admin).

### 3.3 Xem ket qua cham bai
- Vao **Lich su nop bai** → Nhan vao bai nop cu the.
- Trang ket qua hien thi 3 the:
  - **Test Cases**: Tung test case: Pass/Fail, diem so.
  - **Code Quality (AI)**: Diem 0-100, feedback chi tiet bang tieng Viet.
  - **Plagiarism Check**: % tuong dong. Ba vung mau:
    - 🟢 **SAFE** (< 60%): Binh thuong
    - 🟡 **WARNING** (60-79%): Can xem xet
    - 🔴 **DANGER** (≥ 80%): Bi giu diem (SCORE_WITHHELD)

### 3.4 Gui khieu nai (Appeal — US05)
1. Tren trang ket qua, nhan nut **"Gui khieu nai"**.
2. Nhap ly do ro rang (toi thieu 20 ky tu).
3. Nhan **"Gui"** — trang thai Appeal chuyen sang `PENDING`.
4. Sau khi Giang vien xu ly, ban se nhan thong bao:
   - `APPROVED`: Diem duoc cap nhat lai.
   - `REJECTED`: Kem theo ly do tu choi.

---

## 4. HUONG DAN DANH CHO GIANG VIEN

### 4.1 Quan ly Lop hoc (Class Management)
| Thao tac | Mo ta |
|:---------|:------|
| **Tao lop moi** | Nhap ma lop, chon hoc ky |
| **Them sinh vien** | Import file `.xlsx` (Ho ten, MSV, Email) |
| **Xem danh sach sinh vien** | Loc sinh vien ACTIVE / DROPPED |
| **Xoa lop** | Chi Admin moi xoa duoc lop |

**Import sinh vien qua Excel (US06):**
1. Tai template Excel ve (nut **"Tai mau"**).
2. Dien day du: Ho ten, MSV, Email FPT.
3. Upload file → Preview danh sach → Xac nhan.
4. He thong dung Database Transaction: toan bo thanh cong hoac rollback.

### 4.2 Tao de bai (Assignment — US07)
1. Vao lop → **"Tao de bai"**.
2. Dien thong tin:
   - Ten de bai, mo ta, ngon ngu (Java / Python / C#)
   - Deadline, tieu chi cham
3. Them Test Cases: Input / Expected Output / Trong so diem (score_weight).
4. Nhan **"Tao"** — de bai xuat hien trong Dashboard sinh vien.

**Nhan ban de bai cu (UC-02):**
1. Nhan **"Import tu de bai cu"**.
2. Chon de bai nguon (sourceAssignmentId).
3. He thong clone toan bo de bai + test cases sang lop moi.
4. Neu ngon ngu khac → He thong hien thi canh bao.

### 4.3 Quan ly khieu nai (Appeals — US10)
1. Dashboard → Tab **"Khieu nai dang cho"**.
2. Nhan vao tung khieu nai, xem:
   - Ly do sinh vien dua ra
   - Ket qua cham goc (Sandbox + AST + AI)
   - Lich su chinh sua diem (Score Audit Log)
3. Chon:
   - **"Chap nhan"** → Nhap diem moi → He thong tu ghi audit log (Risk R03).
   - **"Tu choi"** → Nhap ly do phan hoi → Sinh vien nhan thong bao.

### 4.4 Lecturer Dashboard — Thong ke (US09)
Xem thong ke theo tung de bai:
- **Ty le nop bai**: So sinh vien da nop / tong sinh vien ACTIVE (%).
- **Phan bo diem**: Bieu do cot 4 thang (< 5, 5-6.5, 6.5-8, 8-10).
- **Diem trung binh** cua lop.
- **Top 10 cap nghi van dao van**: Sap xep theo % tuong dong giam dan.

---

## 5. HUONG DAN DANH CHO QUAN TRI VIEN

### 5.1 Quan ly nguoi dung
- Xem danh sach tat ca Users (Student / Lecturer / Admin).
- Vo hieu hoa / Kich hoat tai khoan.
- Chinh sua quyen han.

### 5.2 Cau hinh he thong
- Gioi han nop bai: Mac dinh **5 lan** / sinh vien / de bai (co the dieu chinh).
- Nguong dao van: Mac dinh **WARNING = 60%**, **DANGER = 80%** (co the chinh).
- Cau hinh URL AST Engine (mac dinh: `http://localhost:8000`).

### 5.3 Quan ly Lop hoc
- Xem tat ca cac lop hoc trong he thong.
- **Xoa lop** (Admin only — Giang vien khong xoa duoc).

---

## 6. GIAI THICH KET QUA CHAM BAI

### 6.1 Trang thai bai nop (Submission Status)

| Trang thai | Y nghia | Hanh dong tiep theo |
|:----------:|:--------|:--------------------|
| `PENDING` | Dang trong hang doi | Cho xu ly tu dong |
| `RUNNING` | Dang cham trong Sandbox | Xem tien trinh real-time |
| `COMPLETED` | Da co diem chinh thuc | Xem ket qua chi tiet |
| `SCORE_WITHHELD` | Diem bi giu do nghi van dao van | Cho Giang vien xem xet |
| `FAILED` | Loi he thong, khong cham duoc | Lien he Giang vien |

### 6.2 Trang thai kiem tra AST (astCheckStatus)

| Trang thai | Y nghia |
|:----------:|:--------|
| `PENDING` | Chua kiem tra AST |
| `DONE` | Kiem tra hoan thanh, ket qua chinh xac |
| `FAILED` | AST Engine loi (bai nop van hop le, ket qua khong co AST) |
| `NEEDS_REVIEW` | Code loi cu phap, dung fallback LEX — Giang vien nen kiem tra tay |

### 6.3 Cach tinh diem cuoi

```
Diem cuoi = (Sandbox score × 70%) + (AI Code Quality score × 30%)
```
- **Sandbox score**: Tong trong so cac test case Pass / Tong trong so tat ca test case × 10.
- **AI Code Quality**: AI cham 0-100 → quy doi ve thang 10.
- Neu `SCORE_WITHHELD`: Diem tam giu, khong hien thi den khi Giang vien xu ly.

---

## 7. XU LY LOI THUONG GAP

| Ma loi | Thong bao | Nguyen nhan | Giai phap |
|:------:|:----------|:------------|:----------|
| 400 | "Email khong hop le" | Email khong phai @fpt/@fe | Dung email truong |
| 400 | "File vuot qua kich thuoc cho phep" | File > 10MB | Nen lai file, xoa file thu vien |
| 400 | "Dinh dang file khong hop le" | Khong phai .zip | Nen thanh .zip dung dinh dang |
| 409 | "Ban da dat gioi han nop bai" | Da nop ≥ 5 lan | Lien he Giang vien xin them luot |
| 500 | "Loi may chu khi cham bai" | Sandbox loi | Thu lai sau 5 phut, lien he Admin |

### Loi khong hien ket qua AST
- Neu thanh tien trinh dung lai o buoc AST_CHECK → File zip co the loi cu phap Java.
- Kiem tra: Code co bien dich duoc o IDE cua ban khong?
- Bai nop van duoc tinh diem bang Sandbox + AI, nhung khong co ket qua AST.

### Khong nhan duoc thong bao real-time
- Kiem tra ket noi internet.
- Thu tai lai trang (WebSocket se tu dong ket noi lai).
- Neu van loi, ket qua van duoc luu → Xem o trang "Lich su nop bai".

---

*Moi van de ky thuat, lien he nhom phat trien: nhom3-swp391@fpt.edu.vn*
