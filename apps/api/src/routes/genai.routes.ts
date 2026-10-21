import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  reviewSubmission,
  generateAssignment,
  getAiStats,
} from "../controllers/genai.controller.js";
import {
  authenticateJWT,
  authorizeRole,
  requireInternalApiKey,
} from "../middlewares/auth.middleware.js";

const router = Router();

// Mỗi giảng viên tối đa 5 lượt sinh đề/phút để tránh cạn quota LLM
const generateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String((req as any).user?.userId ?? (req as any).user?.id ?? "unknown"),
  message: {
    success: false,
    message: "Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.",
  },
});

// 1. Endpoint nội bộ cho Queue Worker
router.post("/review", requireInternalApiKey, reviewSubmission);

// 2. Giảng viên sinh đề bài tự động (US-08: chỉ LECTURER)
router.post(
  "/assignments/generate",
  authenticateJWT,
  authorizeRole("LECTURER"),
  generateLimiter as any,
  generateAssignment
);

// 3. Giám sát Gateway (nội bộ)
router.get("/stats", requireInternalApiKey, getAiStats);

export default router;
