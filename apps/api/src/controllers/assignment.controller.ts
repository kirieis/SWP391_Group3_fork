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
                message: "Vui lòng điền đủ: classId, title, language, deadline.",
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
            message: "Tạo bài tập thành công!",
            data: assignment,
        });
    } catch (error) {
        console.error("Lỗi createAssignment:", error);
        return res.status(500).json({ success: false, message: "Lỗi máy chủ khi tạo bài tập." });
    }
};

// 2. Clone / Import đề bài từ Assignment cũ sang Lớp mới (UC-02)
export const cloneAssignment = async (req: Request, res: Response) => {
    try {
        const { sourceAssignmentId, targetClassId, newDeadline } = req.body;

        if (!sourceAssignmentId || !targetClassId || !newDeadline) {
            return res.status(400).json({
                success: false,
                message: "Thiếu thông tin sourceAssignmentId, targetClassId hoặc newDeadline.",
            });
        }

        // Lấy đề bài gốc kèm test cases
        const source = await prisma.assignment.findUnique({
            where: { id: sourceAssignmentId },
            include: { testCases: true },
        });

        if (!source) {
            return res.status(404).json({ success: false, message: "Không tìm thấy đề bài gốc để sao chép." });
        }

        // Tạo bản sao sang lớp mới
        const cloned = await prisma.assignment.create({
            data: {
                classId: targetClassId,
                title: `${source.title} (Bản sao)`,
                description: source.description,
                language: source.language,
                deadline: new Date(newDeadline),
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
            message: "Sao chép đề bài thành công!",
            data: cloned,
        });
    } catch (error) {
        console.error("Lỗi cloneAssignment:", error);
        return res.status(500).json({ success: false, message: "Lỗi máy chủ khi sao chép đề bài." });
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
            return res.status(404).json({ success: false, message: "Không tìm thấy bài tập." });
        }

        return res.json({ success: true, data: assignment });
    } catch (error) {
        console.error("Lỗi getAssignmentDetail:", error);
        return res.status(500).json({ success: false, message: "Lỗi máy chủ khi lấy chi tiết bài tập." });
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
            whereClause.classId = String(classId);
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
        console.error("Lỗi getAssignments:", error);
        return res.status(500).json({ success: false, message: "Lỗi máy chủ khi lấy danh sách bài tập." });
    }
};
