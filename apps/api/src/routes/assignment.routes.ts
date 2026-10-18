import { Router } from "express";
import { createAssignment, cloneAssignment, getAssignmentDetail, getAssignmentForSandbox, getAssignments, deleteAssignment } from "../controllers/assignment.controller.js";
import { authenticateJWT, authorizeRole, requireInternalApiKey } from "../middlewares/auth.middleware.js";

const router = Router();

// Lấy danh sách bài tập (Sinh viên/Giảng viên)
router.get("/", authenticateJWT, getAssignments);

// Sandbox Engine chỉ được đọc test case qua Internal API Key.
router.get("/internal/:assignmentId", requireInternalApiKey, getAssignmentForSandbox);

// Xem chi tiết đề bài (Ai đã đăng nhập đều xem được)
router.get("/:assignmentId", authenticateJWT, getAssignmentDetail);

// Delete an assignment (only its owning lecturer or an administrator)
router.delete("/:assignmentId", authenticateJWT, authorizeRole("LECTURER", "ADMIN"), deleteAssignment);

// Tạo đề bài mới kèm Test Cases (chỉ LECTURER hoặc ADMIN)
router.post("/", authenticateJWT, authorizeRole("LECTURER", "ADMIN"), createAssignment);

// Sao chép đề bài cũ sang lớp mới (UC-02)
router.post("/clone", authenticateJWT, authorizeRole("LECTURER", "ADMIN"), cloneAssignment);

export default router;
