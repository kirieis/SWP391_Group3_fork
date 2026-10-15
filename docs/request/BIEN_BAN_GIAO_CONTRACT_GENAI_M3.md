# 📋 BIÊN BẢN BÀN GIAO CONTRACT & XÁC MINH VIỆC 0 (PHÂN HỆ 3 — HUY)

> **Ngày lập:** 14/10/2026  
> **Người gửi:** Dev Huy (Phân hệ 3 — GenAI Core)  
> **Người nhận:** Dev Thịnh (Phân hệ 5 — Queue Worker) & Dev An (Phân hệ 1 — Portal/Backend)  
> **Căn cứ:** `docs/05_plan/plan_genai_dev_huy_v2.1.md` (Việc 0 & Việc 2A)  

---

## 1. KẾT QUẢ XÁC MINH MÔI TRƯỜNG & HẠ TẦNG (VIỆC 0)

1. **Thư viện Rate Limiting:** Đã cài đặt `express-rate-limit@8.7.1` cho `apps/api`. Sử dụng cấu hình `limit: 5` (window 60s) cho route sinh đề bài `/api/assignments/generate`.
2. **Hạ tầng Redis:** `apps/api/src/services/cache.service.ts` đã có sẵn Redis Client singleton (`getRedisClient`) dùng chung với cơ chế graceful degradation (fail-open: Redis lỗi thì API vẫn chạy bình thường). Phân hệ 3 sẽ tái sử dụng client này cho Quota và Cache SHA-256.
3. **Thứ tự Mount Router:** Đã xác minh `apps/api/src/index.ts`. Không có middleware JWT toàn cục trên `/api`. Route `genaiRoutes` được mount TRƯỚC `assignmentRoutes` để đảm bảo `/api/assignments/generate` không bị router của An bắt nhầm.
4. **Quyết định chốt:**
   - **D1:** Khi AI `PENDING`, tổng điểm = Điểm Test quy thang 100. Gắn nhãn `ai_feedback = "AI Review Pending"`.
   - **D2:** Worker đọc file và gửi `sourceCode` vào payload (API không truy cập filesystem của Worker).
   - **D4:** Quyền sinh đề bài US-08: Chỉ dành cho `LECTURER`.
   - **D6:** Re-review các bài PENDING là phạm vi ngoài Milestone 3 (đưa vào backlog).

---

## 2. NỘI DUNG CONTRACT BÀN GIAO CHO THỊNH & AN (VIỆC 2A)

### 2.1. File cập nhật: `apps/queue-worker/src/contracts/genai.contract.ts`

```typescript
export interface GenAiReviewRequest {
  submissionId: string;
  language: string;
  fileRelativePath?: string;
  sourceCode?: string;
  sandboxSummary?: {
    outcome: string;
    passedTests: number;
    totalTests: number;
    executionTimeMs: number;
  };
  isCompilationError?: boolean;
  compileOutput?: string;
}

export interface GenAiReviewResponse {
  reviewStatus: "DONE" | "PENDING";
  cleanCodeScore: number | null; // null khi PENDING (không phạt sinh viên mất 40% điểm)
  feedback: string;
  compilationExplanation?: string;
  pendingReason?: "AI_UNAVAILABLE" | "INVALID_AI_RESPONSE" | "EMPTY_SOURCE";
}
```

### 2.2. Yêu cầu phối hợp phía Queue Worker & Portal:
1. Khi `reviewStatus === "PENDING"` (tức `cleanCodeScore === null`):
   - Không áp 40% trọng số Clean Code vào tổng điểm.
   - Ghi `ai_feedback = "AI Review Pending"`.
   - Bài nộp vẫn được cập nhật trạng thái `COMPLETED` hoặc `SCORE_WITHHELD` dựa trên kết quả Sandbox và AST.
2. Cấu hình Timeout HTTP của `genai.client.ts`: Đặt $\ge 45.000\text{ms}$ (để đủ thời gian cho Gateway fallback 40s).
3. **Thứ tự release:** Thịnh merge cập nhật xử lý `null` trong Worker trước, sau đó Huy merge controller/routes vào nhánh chung.

---

### 💬 MẪU TIN NHẮN GỬI THỊNH & AN:
> *"Chào Thịnh và An, Phân hệ 3 sắp mở endpoint `POST /api/review`. Response sẽ cập nhật theo chuẩn mới: thêm `reviewStatus: 'DONE' | 'PENDING'`, và `cleanCodeScore` đổi thành `number | null` (null khi PENDING để tránh trừ oan điểm sinh viên). Nhờ Thịnh hỗ trợ: (1) khi PENDING không áp 40% Clean Code, ghi ai_feedback = 'AI Review Pending'; (2) đặt timeout HTTP của genai.client ≥ 45s; (3) merge xong báo mình để mình merge endpoint vào nhánh chung. Chi tiết xem tại `docs/request/BIEN_BAN_GIAO_CONTRACT_GENAI_M3.md` nhé!"*
