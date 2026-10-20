import { Router, Request } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import {
  reviewSubmission,
  generateAssignment,
  generateFromDocument,
  regenerateTestCases,
  parseDocument,
  getAiStats,
} from "../controllers/genai.controller.js";
import {
  authenticateJWT,
  authorizeRole,
  requireInternalApiKey,
} from "../middlewares/auth.middleware.js";

const router = Router();

// Upload config trong bộ nhớ, tối đa 30MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

// Mỗi giảng viên tối đa 5 lượt sinh đề/phút để tránh cạn quota LLM
const generateLimiter: any = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ((req: any) => String(req.user?.userId ?? req.user?.id ?? "unknown")) as any,
  message: {
    success: false,
    message: "Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.",
  },
});

// 1. Endpoint nội bộ cho Queue Worker
router.post("/review", requireInternalApiKey, reviewSubmission);

// 2. Giảng viên: Upload & Phân tích cấu trúc tài liệu (PDF/TXT)
router.post(
  "/assignments/parse-document",
  authenticateJWT,
  authorizeRole("LECTURER", "ADMIN"),
  ((req: any, res: any, next: any) => {
    upload.single("file")(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            success: false,
            message: "File is too large. Maximum allowed document size is 30MB.",
          });
        }
        return res.status(400).json({
          success: false,
          message: err.message || "File upload error.",
        });
      }
      next();
    });
  }) as any,
  parseDocument
);

// 3. Giảng viên: Sinh đề bài từ chương tài liệu được chọn
router.post(
  "/assignments/generate-from-document",
  authenticateJWT,
  authorizeRole("LECTURER", "ADMIN"),
  generateLimiter as any,
  generateFromDocument
);

// 4. Giảng viên: Sinh lại riêng bộ test cases cho bài tập
router.post(
  "/assignments/regenerate-testcases",
  authenticateJWT,
  authorizeRole("LECTURER", "ADMIN"),
  generateLimiter as any,
  regenerateTestCases
);

// 5. Giảng viên sinh đề bài tự động theo topic tự do (Legacy US-08)
router.post(
  "/assignments/generate",
  authenticateJWT,
  authorizeRole("LECTURER", "ADMIN"),
  generateLimiter as any,
  generateAssignment
);

// 6. Giám sát Gateway (nội bộ)
router.get("/stats", requireInternalApiKey, getAiStats);

export default router;
