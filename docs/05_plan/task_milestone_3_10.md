# AITA-INTELLIGENT — Task Tuần 3-10 (chia theo Milestone Syllabus)

> 5 Dev cố định theo 5 phân hệ, không random nữa: An = Phân hệ 1 (Portal & Auth + API Gateway/DB), Thiên = Phân hệ 2 (Docker Sandbox), Huy = Phân hệ 3 (GenAI Core), Nhật = Phân hệ 4 (AST/RBL — trọng tâm RBL của môn, cố định), Thịnh = Phân hệ 5 (Redis Queue & Teamwork Analytics).

---

# 🟦 TUẦN 3-5 — MILESTONE 2 (20%): Core Workflow từng phân hệ riêng lẻ

> Theo Syllabus: mã hóa Phân hệ 1, 2, 4, 5 — **CHƯA tích hợp end-to-end**, mỗi phân hệ chạy độc lập trước. Bị P2P: tấn công Sandbox (fork bomb, timeout, ghi đè host) + thử AST Bypass (đổi biến/hàm/comment, phải phát hiện similarity >80%).

## Phân hệ 1 — Portal & Auth (An)
- [ ] Login SSO (6.7.1): Google Sign-in, chỉ nhận `@fpt.edu.vn`/`@fe.edu.vn`, toast lỗi sai domain, redirect `/dashboard`
- [ ] Student Dashboard (6.7.2): assignment cards, quick stats, sort theo deadline
-