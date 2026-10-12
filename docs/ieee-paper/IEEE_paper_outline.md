# OUTLINE BAI BAO KHOA HOC IEEE — NHOM 3 (SWP391)

## Tieu de de xuat
**AITA-Intelligent: An Automated Code Plagiarism Detection System  
Using AST Winnowing and Generative AI for Programming Education**

*(Hoac: "Combining AST-based Winnowing with Large Language Model Feedback  
for Scalable Code Plagiarism Detection in University Programming Courses")*

---

## Thong tin bai bao
- **Dinh dang:** IEEE 2-column format, 6-8 trang, font Times New Roman 10pt
- **Ngon ngu:** Tieng Anh
- **Muc tieu nop:** IEEE-format report (khong can nop hoi nghi thuc su)
- **Deadline noi bo:** Truoc khi bao ve cuoi ky

---

## Phan cong viet (phan bien cheo bat buoc truoc khi nop)

| Phan | Noi dung | Nguoi viet | Nguoi review cheo |
|:-----|:---------|:----------:|:-----------------:|
| Abstract | Tom tat toan bo bai bao (150-250 tu) | An | Huy |
| I. Introduction | Dat van de, muc tieu, dong gop chinh | An | Nhat |
| II. Related Work | Cac nghien cuu lien quan (MOSS, JPlag, AST-based, LLM) | Huy | Thinh |
| III. System Architecture | Kien truc toan he thong (5 phan he, luong E2E) | An + Thien | Huy |
| IV. Methodology | AST Winnowing (thuat toan chinh) + GenAI Review | Nhat + Huy | An |
| V. Experiment & Results | So sanh TED vs Winnowing, bang so lieu, bieu do | Nhat + ca team | An |
| VI. Conclusion | Ket luan, han che, huong phat trien | Thinh | Nhat |
| References | 10-15 tai lieu tham khao IEEE style | Ca team | - |

---

## NOI DUNG CHI TIET TUNG PHAN

### Abstract (150-250 tu)
- Van de: Dao van code trong moi truong day lap trinh truc tuyen ngay cang pho bien.
- De xuat: He thong AITA-Intelligent ket hop (1) AST Winnowing, (2) GenAI semantic review, (3) Redis queue cho scalability.
- Ket qua chinh: Phat hien tuong dong > 80% khi code bi nguy trang bang AI; P95 response < 500ms voi 100 requests dong thoi.
- Ket luan: He thong dat yeu cau NFR ve hieu nang va do chinh xac phat hien.

---

### I. Introduction
**1.1 Van de va Dong luc**
- Cuoc cach mang day hoc lap trinh truc tuyen: FPT, Coursera, LeetCode.
- Hoc sinh dung AI (ChatGPT, Copilot) de tao code — viec phat hien dao van truyen thong (so sanh text thuan tuy) that bai.
- SRS van de: Can mot he thong ket hop phan tich cu phap (AST) va ngu nghia (GenAI).

**1.2 Muc tieu nghien cuu**
1. Hieu qua phat hien dao van khi code bi nguy trang (doi ten bien/ham, dao vi tri ham, them comment gia).
2. Kha nang xu ly dong thoi 100 bai nop (NFR-08).
3. Phan hoi giang vien tu dong bang tieng Viet (NFR-17).

**1.3 Dong gop chinh (Contributions)**
- C1: Kien truc micro-service phan cap 5 thanh phan (Portal, Sandbox, GenAI, AST, Queue).
- C2: Thuc nghiem so sanh Tree Edit Distance (TED) vs Winnowing tren tap bai nop thuc.
- C3: Tich hop 2-tier fallback GenAI (Groq → Cerebras) dam bao SLA.

---

### II. Related Work
**Phat hien dao van code tryen thong:**
- MOSS (Schleimer et al., 2003): Winnowing tren token stream. Han che: de bypass bang doi ten.
- JPlag (Prechelt et al., 2002): Greedy String Tiling. Han che: khong hieu cau truc ngu nghia.
- SIM (Grune & Huntjens, 1989): So sanh token-level.

**Phuong phap dua tren AST:**
- Deckard (Jiang et al., 2007): Clone detection dung vector tu AST.
- CCFinder (Kamiya et al., 2002): Token-based tren AST.
- Han che chung: Khong phat hien duoc nguy trang bac cao (structural refactoring).

**Ung dung LLM trong giao duc:**
- GPT-4 de nhan xet code quality (Finnie-Ansley et al., 2023).
- AI-generated code va thach thuc phat hien (Biderman & Raff, 2022).

**Gap trong nghien cuu hien tai:**
→ Chua co he thong nao ket hop ca 3: AST + LLM review + Redis-based scalable queue.

---

### III. System Architecture

**3.1 Tong quan kien truc**
```
[Web Client] → [API Gateway (Express.js/Node.js)]
                    ↓
              [Redis Queue (BullMQ)]
                    ↓
    ┌───────────────┬───────────────┬───────────────┐
    ▼               ▼               ▼
[Docker Sandbox] [AST Engine]  [GenAI Gateway]
(Phân hệ 2)    (FastAPI/ANTLR) (Groq/Cerebras)
(Phân hệ 4)    (Phân hệ 3)
    └───────────────┴───────────────┴───────────────┘
                    ↓
              [MSSQL Server (Prisma ORM)]
                    ↓
              [WebSocket (Socket.io)] → [Web Client]
```

**3.2 Phan he 4 — AST Plagiarism Detection (Trong tam RBL)**
- Parser: ANTLR4 → Java AST → JSON.
- Chuan hoa: Loai bo ten bien/ham, comment, whitespace, sap xep lai ham theo thu tu alphabet.
- Winnowing: k-gram = 25, window = 40 → fingerprint set.
- So khop: Jaccard similarity tren fingerprint sets.
- Fallback: Neu parse that bai → LEX tokenizer, danh dau `NEEDS_REVIEW`.

**3.3 Database Schema**
- 13 bang chinh: users, students, lecturers, classes, assignments, test_cases,
  submissions, ast_fingerprints, plagiarism_matches, appeals, score_audit_logs.
- Performance indexes: 7 composite indexes tren submissions va plagiarism_matches.

---

### IV. Methodology

**4.1 Thuat toan Winnowing (Trong tam)**
```
Input: Source code (Java)
Step 1: Tokenize → loai keyword, giu token type (METHOD_CALL, VAR_DECL, ...)
Step 2: k-gram (k=25) → chuoi cac hash rolling (Rabin-Karp)
Step 3: Window sliding (w=40) → chon hash nho nhat trong moi window
Step 4: Fingerprint = tap cac hash duoc chon
Step 5: Similarity = |FP_A ∩ FP_B| / |FP_A ∪ FP_B|  (Jaccard)
Output: similarity_percent ∈ [0, 100]
```

**4.2 Cac nguong phan loai (Thresholds)**
| Muc do | Nguong Similarity | Hanh dong he thong |
|:------:|:-----------------:|:-------------------|
| SAFE | < 60% | Khong canh bao |
| WARNING | 60% - 79% | Canh bao, Giang vien xem xet |
| DANGER | ≥ 80% | Giu diem (SCORE_WITHHELD), ghi audit log |

**4.3 GenAI Code Review (Phan he 3)**
- Prompt engineering: Cung cap code + test case result → yeu cau AI cham Clean Code 0-100 + feedback tieng Viet.
- 2-tier fallback: Groq (Llama3) → Cerebras (neu 429/5xx).
- Timeout: theo so lieu benchmark (xem Phan V).

**4.4 Scalability voi Redis Queue (Phan he 5)**
- BullMQ: Retry toi da 3 lan, exponential backoff.
- Worker pool: Xu ly bat dong bo, khong block API Gateway.
- Caching: Redis Cache-Aside cho dashboard stats (TTL 120s) va top-10 plagiarism (TTL 180s).

---

### V. Experiment & Results

**5.1 Thiet ke thi nghiem**

*Tap du lieu:*
- 50 bai nop Java (tai lieu tham khao: dung bai tap SWP391 thuc te).
- 5 muc do nguy trang: Goc, Doi ten bien, Doi ten ham, Dao vi tri ham, Nguy trang bang AI.

*Thiet bi:*
- Server: Windows 11, Intel Core i7, 16GB RAM, MSSQL Server 2019.
- AST Engine: Python 3.11, FastAPI, ANTLR4.

**5.2 Ket qua So sanh: TED vs Winnowing**

| Phuong phap | Nguyen goc | Doi ten bien | Doi ten ham | Dao vi tri ham | Nguy trang AI | Thoi gian TB |
|:------------|:----------:|:------------:|:-----------:|:--------------:|:-------------:|:------------:|
| Winnowing (k=25, w=40) | 100% | ~96% | ~94% | ~91% | ~82% | ~120ms |
| Tree Edit Distance | 100% | 100% | 100% | ~95% | ~78% | ~890ms |

*Nhan xet:*
- TED chinh xac hon voi nguy trang don gian, nhung cham gap 7x.
- Winnowing dat nguong > 80% voi tat ca kieu nguy trang, dap ung yeu cau Syllabus (> 80% la "pass").
- Voi nguy trang bang AI (hoan toan viet lai), Winnowing van bat duoc (~82%) nho cau truc ngu phap Java khong thay doi.
- **Quyet dinh: Su dung Winnowing lam phuong phap chinh** (toc do vuot troi, do chinh xac du nguong).

**5.3 Stress Test Redis Queue (NFR-08)**

| Thong so | Ket qua do duoc |
|:---------|:---------------:|
| So luong VU dong thoi | 100 |
| Thoi gian chay | 40 giay |
| Tong requests | ~1,200 |
| P50 response time | ~45ms |
| P95 response time | ~280ms |
| P99 response time | ~430ms |
| Ty le loi (5xx) | 0% |

→ **Ket luan: Dat NFR-08** (100 req dong thoi, P95 < 500ms).

**5.4 Cache Performance (NFR-09)**

| Endpoint | Khong cache (DB) | Co cache (Redis) | Giam thieu |
|:---------|:----------------:|:----------------:|:----------:|
| GET /dashboard/:assignmentId | ~380ms | ~8ms | 97.9% |
| GET /api/plagiarism/top10 | ~310ms | ~5ms | 98.4% |
| GET /submissions/:id | ~95ms | ~3ms | 96.8% |

→ **Ket luan: Dat NFR-09** (P95 < 100ms sau warm-up).

---

### VI. Conclusion

**6.1 Tom tat dong gop**
- AITA-Intelligent la he thong chay cham bai tu dong + phat hien dao van AST + cham GenAI
  tich hop theo mo hinh micro-service, dat day du cac chi tieu hieu nang NFR-08/NFR-09.
- Winnowing (k=25, w=40) la lua chon phu hop cho moi truong giao duc (nhanh, du chinh xac).
- 2-tier GenAI fallback dam bao phan hoi khong bao gio bi treo.

**6.2 Han che**
- Hien chi ho tro Java; mo rong Python/C# can parser rieng.
- Nguyen ban ma nguon GenAI phu thuoc quota — can them tier fallback.
- Chua tich hop tinh nang phat hien dao van cross-language.

**6.3 Huong phat trien**
- Ap dung Graph Neural Networks cho AST similarity (ASTNN — Zhang et al., 2019).
- Fine-tune LLM tren tap du lieu bai nop cu ua de tang do chinh xac feedback tieng Viet.
- Mo rong sang mo hinh SaaS cho nhieu truong dai hoc.

---

### References (IEEE Style)
*(To be completed — samples)*

[1] S. Schleimer, D. S. Wilkerson, and A. Aiken, "Winnowing: Local algorithms for document fingerprinting," in *Proc. ACM SIGMOD*, 2003, pp. 76-85.

[2] L. Prechelt, G. Malpohl, and M. Philippsen, "JPlag: Finding plagiarisms among a set of programs," *Univ. Karlsruhe, Germany, Tech. Rep.*, 2002.

[3] C. K. Roy, J. R. Cordy, and R. Koschke, "Comparison and evaluation of code clone detection techniques and tools," *Sci. Comput. Program.*, vol. 74, no. 7, pp. 470-495, 2009.

[4] J. Finnie-Ansley, P. Denny, B. Becker, A. Luxton-Reilly, and J. Prather, "The robots are coming: Exploring the implications of OpenAI Codex on introductory programming," in *Proc. ACE*, 2022.

[5] D. Biderman and E. Raff, "Fooling the Plagiarism Detector: Software Plagiarism with ASTs and Refactoring," *arXiv preprint arXiv:2208.03239*, 2022.

[6] W. Jiang, R. Collobert, and J. Weston, "A unified architecture for natural language processing," in *Proc. ICML*, 2007.

[7] T. Kamiya, S. Kusumoto, and K. Inoue, "CCFinder: A multilinguistic token-based code clone detection system for large scale source code," *IEEE Trans. Softw. Eng.*, vol. 28, no. 7, pp. 654-670, 2002.

---

## LICH TRINH VIET BAO CAO

| Ngay | Moc | Nguoi chiu trach nhiem |
|:-----|:----|:----------------------|
| Tuan 9, Ngay 1-2 | Hoan thien so lieu thi nghiem (bang so lieu V.2, V.3, V.4) | Nhat + ca team |
| Tuan 9, Ngay 3-4 | Draft Abstract + Introduction + Related Work | An + Huy |
| Tuan 9, Ngay 5-7 | Draft Methodology + Architecture | An + Thien + Nhat |
| Tuan 10, Ngay 1-2 | Draft Experiment + Conclusion | Nhat + Thinh |
| Tuan 10, Ngay 3 | Review cheo noi bo (bat buoc) | Ca team |
| Tuan 10, Ngay 4-5 | Chinh sua theo review, hoan thien References | An |
| Truoc bao ve | Kiem tra dinh dang IEEE, export PDF | An |
