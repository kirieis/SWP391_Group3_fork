import { Request, Response } from "express";
import { prisma } from "../prisma.js";

// 1. Tạo Assignment mới kèm danh sách Test Cases (US07)
export const createAssignment = async (req: Request, res: Response) => {
    try {
        const {
            classId,
            title,
            description,
            language, // "Java", "Python", "C#"
            deadline,
            gradingCriteria,
            testCases = [], // Array: [{ inputData, expectedOutput, scoreWeight }]
        } = req.body;

        if (!classId || !title || !language || !deadline) {
            return res.status(400).json({
                success: false,
                message: "Please fill in: classId, title, language, deadline.",
            });
        }

        const assignment = await prisma.assignment.create({
            data: {
                classId,
                title,
                description,
                language,
                deadline: new Date(deadline),
                gradingCriteria: gradingCriteria ? JSON.stringify(gradingCriteria) : null,
                testCases: {
                    create: testCases.map((tc: any) => ({
                        inputData: tc.inputData || "",
                        expectedOutput: tc.expectedOutput || "",
                        scoreWeight: Number(tc.scoreWeight) || 1,
                    })),
                },
            },
            include: {
                testCases: true,
            },
        });

        return res.status(201).json({
            success: true,
            message: "Create assignment successfully!",
            data: assignment,
        });
    } catch (error) {
        console.error("Error createAssignment: ", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};

// 2. Clone / Import đề bài từ Assignment cũ sang Lớp mới (UC-02)
export const cloneAssignment = async (req: Request, res: Response) => {
    try {
        const { sourceAssignmentId, targetClassId, newDeadline } = req.body;

        if (!sourceAssignmentId || !targetClassId || !newDeadline) {
            return res.status(400).json({
                success: false,
                message: "Missing sourceAssignmentId, targetClassId or newDeadline.",
            });
        }

        const user = req.user;
        if (!user?.userId) {
            return res.status(401).json({ success: false, message: "Unauthorized." });
        }

        // Only allow lecturers to copy assignments they own and into their own classes.
        const targetClass = await prisma.class.findUnique({
            where: { id: targetClassId },
            select: { id: true, lecturerId: true },
        });

        if (!targetClass) {
            return res.status(404).json({ success: false, message: "Target class not found." });
        }

        if (user.role === "LECTURER" && targetClass.lecturerId !== user.userId) {
            return res.status(403).json({ success: false, message: "You can only copy assignments into your own classes." });
        }

        // Load the source assignment and test cases.
        const source = await prisma.assignment.findUnique({
            where: { id: sourceAssignmentId },
            include: { testCases: true, class: { select: { lecturerId: true } } },
        });

        if (!source) {
            return res.status(404).json({ success: false, message: "Assignment not found." });
        }

        if (user.role === "LECTURER" && source.class.lecturerId !== user.userId) {
            return res.status(403).json({ success: false, message: "You can only copy assignments you created in classes you manage." });
        }

        const parsedDeadline = new Date(newDeadline);
        if (Number.isNaN(parsedDeadline.getTime())) {
            return res.status(400).json({ success: false, message: "Please provide a valid deadline." });
        }

        // Create a copy in the target class. The source assignment remains unchanged.
        const cloned = await prisma.assignment.create({
            data: {
                classId: targetClassId,
                title: `${source.title} (Clone)`,
                description: source.description,
                language: source.language,
                deadline: parsedDeadline,
                gradingCriteria: source.gradingCriteria,
                testCases: {
                    create: source.testCases.map((tc) => ({
                        inputData: tc.inputData,
                        expectedOutput: tc.expectedOutput,
                        scoreWeight: tc.scoreWeight,
                    })),
                },
            },
            include: { testCases: true },
        });

        return res.status(201).json({
            success: true,
            message: "Clone assignment successfully!",
            data: cloned,
        });
    } catch (error) {
        console.error("Error cloneAssignment: ", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};

// 3. Lấy chi tiết Assignment kèm test cases
export const getAssignmentDetail = async (req: Request, res: Response) => {
    try {
        const { assignmentId } = req.params;

        const assignment = await prisma.assignment.findUnique({
            where: { id: assignmentId },
            include: {
                testCases: true,
                class: true,
            },
        });

        if (!assignment) {
            return res.status(404).json({ success: false, message: "Assignment not found." });
        }

        return res.json({ success: true, data: assignment });
    } catch (error) {
        console.error("Error getAssignmentDetail: ", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};


// Endpoint nội bộ cho Sandbox Engine: chỉ trả dữ liệu cần để chạy test case.
export const getAssignmentForSandbox = async (req: Request, res: Response) => {
    try {
        const { assignmentId } = req.params;
        const assignment = await prisma.assignment.findUnique({
            where: { id: assignmentId },
            select: {
                id: true,
                language: true,
                testCases: {
                    select: {
                        id: true,
                        inputData: true,
                        expectedOutput: true,
                        scoreWeight: true,
                    },
                },
            },
        });

        if (!assignment) {
            return res.status(404).json({ success: false, message: "Không tìm thấy bài tập." });
        }

        return res.json({ success: true, data: assignment });
    } catch (error) {
        console.error("Lỗi getAssignmentForSandbox:", error);
        return res.status(500).json({ success: false, message: "Lỗi máy chủ khi lấy test case." });
    }
};

// 4. Lấy danh sách bài tập theo lớp (hoặc tất cả bài tập sinh viên/giảng viên được xem)
export const getAssignments = async (req: Request, res: Response) => {
    try {
        const { classId } = req.query;
        const user = req.user;

        let whereClause: any = {};
        if (classId) {
            const raw = String(classId).trim();
            if (raw.includes(",")) {
                const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
                whereClause.classId = { in: ids };
            } else {
                whereClause.classId = raw;
            }
        } else if (user?.role === "STUDENT") {
            // Lấy các bài tập thuộc các lớp sinh viên đang theo học
            const enrollments = await prisma.classStudent.findMany({
                where: { studentId: user.userId, status: "ACTIVE" },
                select: { classId: true },
            });
            whereClause.classId = { in: enrollments.map((e) => e.classId) };
        } else if (user?.role === "LECTURER") {
            const classes = await prisma.class.findMany({
                where: { lecturerId: user.userId },
                select: { id: true },
            });
            whereClause.classId = { in: classes.map((c) => c.id) };
        }

        const assignments = await prisma.assignment.findMany({
            where: whereClause,
            include: {
                class: { select: { classCode: true } },
                _count: { select: { submissions: true } },
                submissions: user?.role === "STUDENT" ? {
                    where: { studentId: user.userId },
                    orderBy: { submittedAt: "desc" },
                    take: 1,
                    select: { id: true, status: true, totalScore: true, astCheckStatus: true },
                } : false,
            },
            orderBy: { deadline: "asc" },
        });

        return res.json({ success: true, data: assignments });
    } catch (error) {
        console.error("Error getAssignments: ", error);
        return res.status(500).json({ success: false, message: "Internal server error while getting assignments." });
    }
};


// Delete an assignment owned by the current lecturer (or any assignment for an admin).
export const deleteAssignment = async (req: Request, res: Response) => {
    try {
        const { assignmentId } = req.params;
        const user = req.user;
        if (!user) return res.status(401).json({ success: false, message: "Unauthorized." });
        const assignment = await prisma.assignment.findUnique({
            where: { id: assignmentId },
            include: { class: { select: { lecturerId: true } } },
        });
        if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found." });
        if (user.role === "LECTURER" && assignment.class.lecturerId !== user.userId) {
            return res.status(403).json({ success: false, message: "You can only delete assignments from classes you manage." });
        }
        if (user.role !== "LECTURER" && user.role !== "ADMIN") {
            return res.status(403).json({ success: false, message: "Only lecturers and administrators can delete assignments." });
        }
        await prisma.$transaction(async (tx) => {
            const submissions = await tx.submission.findMany({ where: { assignmentId }, select: { id: true } });
            const submissionIds = submissions.map((submission) => submission.id);
            if (submissionIds.length) {
                // Remove dependent records in FK-safe order before deleting the assignment.
                await tx.plagiarismMatch.deleteMany({ where: { OR: [
                    { submission1Id: { in: submissionIds } },
                    { submission2Id: { in: submissionIds } },
                ] } });
                await tx.submission.deleteMany({ where: { assignmentId } });
            }
            await tx.assignment.delete({ where: { id: assignmentId } });
        });
        return res.json({ success: true, message: "Assignment and its related submissions deleted successfully." });
    } catch (error) {
        console.error("Error deleting assignment:", error);
        return res.status(500).json({ success: false, message: "Unable to delete the assignment. It may have related records that prevent deletion." });
    }
};
