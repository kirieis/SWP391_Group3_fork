import { Router } from "express";
import multer from "multer";
import { createClass, getMyClasses, importStudentsFromExcel, updateClass, deleteClass, removeClassStudents } from "../controllers/class.controller.js";
import { authenticateJWT, authorizeRole } from "../middlewares/auth.middleware.js";


const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Xem danh sách lớp (Sinh viên / Giảng viên / Admin)
router.get("/my-classes", authenticateJWT, getMyClasses);

// Tạo lớp mới (chỉ LECTURER hoặc ADMIN)
router.post("/", authenticateJWT, authorizeRole("LECTURER", "ADMIN"), createClass);

// Import sinh viên vào lớp bằng file Excel (chỉ LECTURER hoặc ADMIN)
router.post("/:classId/import-students", authenticateJWT, authorizeRole("LECTURER", "ADMIN"), upload.single("file") as any, importStudentsFromExcel);

// Remove enrolled students from a class (Lecturer/Admin)
router.delete("/:classId/students", authenticateJWT, authorizeRole("LECTURER", "ADMIN"), removeClassStudents);

// Sửa lớp (Lecturer/Admin)
router.put("/:classId", authenticateJWT, authorizeRole("LECTURER", "ADMIN"), updateClass);
// Xóa lớp (Admin)
router.delete("/:classId", authenticateJWT, authorizeRole("ADMIN"), deleteClass);

export default router;
