import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import {
    submitAssignment,
    getMySubmissions,
    getSubmissionResult,
    createAppeal,
    resolveAppeal,
    getPendingAppeals,
    updateSubmissionGradingResult,
} from "../controllers/submission.controller.js";
import { authenticateJWT, authorizeRole, requireInternalApiKey } from "../middlewares/auth.middleware.js";
import { astService } from "../services/ast.service.js";

const router = Router();

// =========================================================================
// CẤU HÌNH DISK STORAGE (Lưu trực tiếp vào đĩa, chống tràn RAM khi 100 requests)
// =========================================================================
const uploadDir = path.join(process.cwd(), "uploads", "submissions");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Tên file an toàn ngẫu nhiên: sub_<timestamp>_<randomHex>.zip
        const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        cb(null, `sub_${uniqueSuffix}.zip`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (
            file.mimetype === "application/zip" ||
            file.mimetype === "application/x-zip-compressed" ||
            file.originalname.toLowerCase().endsWith(".zip")
        ) {
            cb(null, true);
        } else {
            cb(new Error("Hệ thống chỉ chấp nhận file nén định dạng .zip"));
        }
    },
});

// Nộp bài tập (Sinh viên) - Giới hạn ≤ 10MB
router.post("/", authenticateJWT, authorizeRole("STUDENT"), upload.single("file") as any, submitAssignment);

// Xem các lần nộp của mình theo bài tập
router.get("/assignment/:assignmentId", authenticateJWT, getMySubmissions);

// Xem kết quả chi tiết của 1 bài nộp (Wireframe 6.7.3)
router.get("/:submissionId", authenticateJWT, getSubmissionResult);

// Sinh viên gửi khiếu nại (US05)
router.post("/appeal", authenticateJWT, authorizeRole("STUDENT"), createAppeal);

// Giảng viên xử lý khiếu nại & ghi Audit log (US10, Risk R03)
router.patch("/appeal/:appealId/resolve", authenticateJWT, authorizeRole("LECTURER", "ADMIN"), resolveAppeal);

// Giảng viên xem danh sách khiếu nại chờ duyệt (US10)
router.get("/appeals/pending", authenticateJWT, authorizeRole("LECTURER", "ADMIN"), getPendingAppeals);

// Endpoint nhận cập nhật tiến trình và điểm từ Sandbox/AST/Queue (Thống nhất với Phân hệ 2/4/5)
router.patch("/:submissionId/result", requireInternalApiKey, updateSubmissionGradingResult);

// Endpoint nội bộ dành riêng cho Worker BullMQ (Phân hệ 5) gọi kích hoạt kiểm tra AST (Mục B4)
// Hỗ trợ cả 2 chuẩn đường dẫn để đảm bảo tương thích 100% với Phân hệ 5 và ADR-001
router.post("/internal/:submissionId/ast-check", requireInternalApiKey, async (req, res) => {
    const { submissionId } = req.params;
    const result = await astService.check(submissionId);
    return res.status(result.success ? 200 : 500).json(result);
});

export default router;
