import { Request, Response } from "express";
import * as xlsx from "xlsx";
import { prisma } from "../prisma.js";

// 1. Tạo lớp học mới (chỉ LECTURER hoặc ADMIN)
export const createClass = async (req: Request, res: Response) => {
    try {
        const { classCode } = req.body;
        const lecturerId = req.user?.userId;

        if (!classCode) {
            return res.status(400).json({ success: false, message: "Class code (classCode) is required." });
        }

        if (!lecturerId) {
            return res.status(401).json({ success: false, message: "Unauthorized: User not identified." });
        }

        // Đảm bảo user có profile Lecturer
        const lecturer = await prisma.lecturer.findUnique({
            where: { userId: lecturerId },
        });

        if (!lecturer) {
            return res.status(403).json({ success: false, message: "User account is not a lecturer." });
        }

        const newClass = await prisma.class.create({
            data: {
                classCode: classCode.trim().toUpperCase(),
                lecturerId: lecturerId,
            },
        });

        return res.status(201).json({
            success: true,
            message: "Class created successfully!",
            data: newClass,
        });
    } catch (error: any) {
        console.error("Lỗi createClass:", error);
        return res.status(500).json({ success: false, message: "Server error creating class." });
    }
};

// 2. Lấy danh sách lớp học (tự lọc theo Role)
export const getMyClasses = async (req: Request, res: Response) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ success: false, message: "Unauthorized." });
        }

        if (user.role === "LECTURER") {
            const classes = await prisma.class.findMany({
                where: { lecturerId: user.userId },
                include: {
                    _count: { select: { students: true, assignments: true } },
                    students: {
                        where: { status: "ACTIVE" },
                        include: {
                            student: {
                                include: {
                                    user: { select: { fullName: true, email: true } },
                                },
                            },
                        },
                        orderBy: { enrolledAt: "asc" },
                    },
                },
            });
            return res.json({ success: true, data: classes });
        }

        if (user.role === "STUDENT") {
            const enrollments = await prisma.classStudent.findMany({
                where: { studentId: user.userId, status: "ACTIVE" },
                include: {
                    class: {
                        include: {
                            lecturer: { include: { user: { select: { fullName: true, email: true } } } },
                            _count: { select: { assignments: true } },
                        },
                    },
                },
            });
            return res.json({ success: true, data: enrollments.map((e) => e.class) });
        }

        // Nếu là ADMIN thì lấy tất cả
        const allClasses = await prisma.class.findMany({
            include: {
                lecturer: { include: { user: { select: { fullName: true, email: true } } } },
                _count: { select: { students: true, assignments: true } },
            },
        });
        return res.json({ success: true, data: allClasses });
    } catch (error) {
        console.error("Lỗi getMyClasses:", error);
        return res.status(500).json({ success: false, message: "Server error retrieving classes." });
    }
};

// 3. Import sinh viên bằng file Excel (.xlsx) với Transaction (NFR-12 & US06)
export const importStudentsFromExcel = async (req: Request, res: Response) => {
    try {
        const { classId } = req.params;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, message: "Please attach an Excel file (.xlsx)." });
        }

        // Đọc file Excel từ bộ nhớ đệm (buffer)
        const workbook = xlsx.read(file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[] = xlsx.utils.sheet_to_json(sheet);

        if (rows.length === 0) {
            return res.status(400).json({ success: false, message: "Excel file is empty, no data found." });
        }

        // Định dạng mong đợi: các cột email, studentCode (hoặc mssv), fullName
        const studentsToEnroll: { email: string; studentCode: string; fullName: string }[] = [];

        for (const [index, row] of rows.entries()) {
            // Chuẩn hóa tất cả các key trong row về dạng chữ thường không dấu cách
            const normalizedRow: Record<string, any> = {};
            for (const key of Object.keys(row)) {
                const cleanKey = key.trim().toLowerCase().replace(/[\s_-]+/g, "");
                normalizedRow[cleanKey] = row[key];
            }

            const email = (
                normalizedRow["email"] ||
                normalizedRow["mail"] ||
                ""
            ).toString().trim().toLowerCase();

            const studentCode = (
                normalizedRow["studentcode"] ||
                normalizedRow["mssv"] ||
                normalizedRow["masv"] ||
                normalizedRow["code"] ||
                ""
            ).toString().trim().toUpperCase();

            const fullName = (
                normalizedRow["fullname"] ||
                normalizedRow["hoten"] ||
                normalizedRow["name"] ||
                (email ? email.split("@")[0] : "")
            ).toString().trim();

            if (!email || !studentCode) {
                return res.status(400).json({
                    success: false,
                    message: `Error at row ${index + 2}: Missing Email or Student Code. Entire operation cancelled (Rollback).`,
                });
            }

            studentsToEnroll.push({ email, studentCode, fullName });
        }

        // Chạy Database Transaction đảm bảo ACID: Toàn bộ thành công hoặc Rollback (NFR-12)
        const result = await prisma.$transaction(async (tx) => {
            let enrolledCount = 0;

            for (const item of studentsToEnroll) {
                // Tìm hoặc tạo User + Student
                let user = await tx.user.findUnique({
                    where: { email: item.email },
                    include: { studentProfile: true },
                });

                if (!user) {
                    user = await tx.user.create({
                        data: {
                            email: item.email,
                            fullName: item.fullName,
                            role: "STUDENT",
                            studentProfile: {
                                create: {
                                    studentCode: item.studentCode,
                                },
                            },
                        },
                        include: { studentProfile: true },
                    });
                } else {
                    // Cập nhật họ tên và mã số sinh viên theo đúng thông tin từ file Excel
                    await tx.user.update({
                        where: { id: user.id },
                        data: { fullName: item.fullName },
                    });

                    if (user.studentProfile) {
                        await tx.student.update({
                            where: { userId: user.id },
                            data: { studentCode: item.studentCode },
                        });
                    } else {
                        await tx.student.create({
                            data: {
                                userId: user.id,
                                studentCode: item.studentCode,
                            },
                        });
                    }
                }

                const studentId = user.id;

                // Thêm vào lớp nếu chưa có
                const existingEnrollment = await tx.classStudent.findUnique({
                    where: {
                        classId_studentId: {
                            classId,
                            studentId,
                        },
                    },
                });

                if (!existingEnrollment) {
                    await tx.classStudent.create({
                        data: {
                            classId,
                            studentId,
                            status: "ACTIVE",
                        },
                    });
                    enrolledCount++;
                }
            }

            return { totalImported: enrolledCount };
        });

        return res.json({
            success: true,
            message: `Import successful! Enrolled ${result.totalImported} students into class.`,
            data: result,
        });
    } catch (error: any) {
        console.error("Lỗi importStudentsFromExcel:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Server error importing student list.",
        });
    }
};

// Cập nhật thông tin lớp (Sửa mã lớp, đổi giảng viên)
// Sửa thông tin lớp (Chỉ giảng viên phụ trách lớp đó hoặc ADMIN)
export const updateClass = async (req: Request, res: Response) => {
    try {
        const { classId } = req.params;
        const { classCode, lecturerId } = req.body;
        const user = req.user!;

        // Tìm lớp và kiểm tra quyền sở hữu
        const existingClass = await prisma.class.findUnique({ where: { id: classId } });
        if (!existingClass) {
            return res.status(404).json({ success: false, message: "Class not found." });
        }

        if (user.role === "LECTURER" && existingClass.lecturerId !== user.userId) {
            return res.status(403).json({ success: false, message: "You do not have permission to edit another lecturer's class." });
        }

        // Chỉ Admin mới được phép gán lớp sang giảng viên khác
        if (lecturerId && user.role !== "ADMIN") {
            return res.status(403).json({ success: false, message: "Only administrators can change the lecturer assigned to a class." });
        }

        const updated = await prisma.class.update({
            where: { id: classId },
            data: {
                ...(classCode && { classCode: classCode.trim().toUpperCase() }),
                ...(lecturerId && user.role === "ADMIN" && { lecturerId }),
            },
        });

        return res.json({ success: true, message: "Class updated successfully!", data: updated });
    } catch (error) {
        console.error("Lỗi updateClass:", error);
        return res.status(500).json({ success: false, message: "Server error updating class." });
    }
};

// Xóa lớp học (Chỉ ADMIN)
export const deleteClass = async (req: Request, res: Response) => {
    try {
        const { classId } = req.params;
        const user = req.user!;

        if (user.role !== "ADMIN") {
            return res.status(403).json({ success: false, message: "Only administrators can delete classes." });
        }

        await prisma.class.delete({ where: { id: classId } });
        return res.json({ success: true, message: "Class deleted successfully!" });
    } catch (error) {
        console.error("Lỗi deleteClass:", error);
        return res.status(500).json({ success: false, message: "Server error deleting class." });
    }
};

// Remove one or more students from a lecturer-managed class without deleting their accounts.
export const removeClassStudents = async (req: Request, res: Response) => {
    try {
        const { classId } = req.params;
        const user = req.user;
        const { studentIds, all } = req.body as { studentIds?: string[]; all?: boolean };
        if (!user) return res.status(401).json({ success: false, message: "Unauthorized." });

        const classRecord = await prisma.class.findUnique({ where: { id: classId }, select: { id: true, lecturerId: true } });
        if (!classRecord) return res.status(404).json({ success: false, message: "Class not found." });
        if (user.role === "LECTURER" && classRecord.lecturerId !== user.userId) {
            return res.status(403).json({ success: false, message: "You do not have permission to manage students in this class." });
        }
        if (user.role !== "LECTURER" && user.role !== "ADMIN") {
            return res.status(403).json({ success: false, message: "Only lecturers and administrators can remove students." });
        }

        let ids = Array.isArray(studentIds) ? [...new Set(studentIds.filter((id) => typeof id === "string" && id.trim()))] : [];
        if (all === true) {
            const enrollments = await prisma.classStudent.findMany({ where: { classId, status: "ACTIVE" }, select: { studentId: true } });
            ids = enrollments.map((entry) => entry.studentId);
        }
        if (!ids.length) return res.status(400).json({ success: false, message: "Select at least one student to remove." });

        const result = await prisma.classStudent.deleteMany({ where: { classId, studentId: { in: ids }, status: "ACTIVE" } });
        return res.json({ success: true, message: `Successfully removed ${result.count} student(s) from the class.`, data: { removedCount: result.count } });
    } catch (error) {
        console.error("Error removing class students:", error);
        return res.status(500).json({ success: false, message: "Unable to remove students from the class." });
    }
};
