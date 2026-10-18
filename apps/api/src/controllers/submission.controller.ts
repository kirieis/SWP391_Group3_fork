import { Request, Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { prisma } from "../prisma.js";
import { emitGradingProgress } from "../socket/index.js";
import { env } from "../config/env.js";
import { astService } from "../services/ast.service.js";
import { gradingService } from "../services/grading.service.js";

// Giới hạn số lần nộp tối đa theo Risk R01 (mặc định 5 lần)
const MAX_SUBMISSION_ATTEMPTS = 5;

// 1. Nộp bài tập (US12 & Risk R01)
export const submitAssignment = async (req: Request, res: Response) => {
    try {
        const studentId = req.user?.userId;
        const { assignmentId } = req.body;
        const file = req.file;

        if (!studentId) {
            return res.status(401).json({ success: false, message: "Unauthorized: User not identified." });
        }

        if (!assignmentId || !file) {
            return res.status(400).json({ success: false, message: "Please select an assignment and attach your submission (.zip) file." });
        }

        // 1. Kiểm tra tồn tại Assignment & Deadline
        const assignment = await prisma.assignment.findUnique({
            where: { id: assignmentId },
        });

        if (!assignment) {
            return res.status(404).json({ success: false, message: "Assignment not found." });
        }

        // 2. Kiểm tra Risk R01: Số lần nộp bài của sinh viên cho assignment này
        const submissionCount = await prisma.submission.count({
            where: {
                assignmentId,
                studentId,
            },
        });

        if (submissionCount >= MAX_SUBMISSION_ATTEMPTS) {
            return res.status(429).json({
                success: false,
                message: `You have reached the maximum limit of ${MAX_SUBMISSION_ATTEMPTS} submissions for this assignment (Risk R01).`,
            });
        }
        // 3. Tính SHA-256 từ file trên đĩa
        const fileBuffer = fs.readFileSync(file.path);
        const hashSum = crypto.createHash("sha256");
        hashSum.update(fileBuffer);
        const fileHash = hashSum.digest("hex");

        // 4. Kiểm tra Magic bytes của file ZIP (50 4B 03 04)
        if (fileBuffer.length < 4 || fileBuffer[0] !== 0x50 || fileBuffer[1] !== 0x4b || fileBuffer[2] !== 0x03 || fileBuffer[3] !== 0x04) {
            fs.unlinkSync(file.path); // Xóa file rác
            return res.status(400).json({ success: false, message: "Uploaded file is not a valid ZIP archive (Invalid magic bytes)." });
        }

        // 6. Tạo submission với đường dẫn file đã lưu & AST_CHECK_STATUS = PENDING
        const submission = await prisma.submission.create({
            data: {
                assignmentId,
                studentId,
                fileUrl: `/uploads/submissions/${file.filename}`,
                fileHash,
                status: "PENDING",
                astCheckStatus: "PENDING", // ADR-001 §5: trạng thái kiểm tra đạo văn
            },
        });

        // Phát thông báo tiến trình khởi tạo qua WebSocket
        emitGradingProgress({
            submissionId: submission.id,
            step: "QUEUED",
            progressPercent: 10,
            message: "Submission received and enqueued for grading.",
        });

        // 7. Chạy toàn bộ pipeline chấm điểm tự động trong nền (Sandbox -> AST -> AI Review -> Hoàn tất điểm)
        // Dùng setImmediate để trả về 202 Accepted ngay cho client theo US12
        setImmediate(async () => {
            try {
                await gradingService.gradeSubmission(submission.id, file.path);
            } catch (err) {
                console.error("[Grading Pipeline] Unhandled error:", err);
            }
        });

        // Trả về mã 202 Accepted theo đúng đặc tả US12 — NGAY LẬP TỨC
        return res.status(202).json({
            success: true,
            message: "Submission successful! Automatic grading in progress.",
            data: {
                submissionId: submission.id,
                attemptsLeft: MAX_SUBMISSION_ATTEMPTS - (submissionCount + 1),
                status: submission.status,
            },
        });
    } catch (error) {
        console.error("Lỗi submitAssignment:", error);
        return res.status(500).json({ success: false, message: "Server error during submission." });
    }
};

// 2. Xem lịch sử nộp bài của sinh viên theo Assignment
export const getMySubmissions = async (req: Request, res: Response) => {
    try {
        const studentId = req.user?.userId;
        const { assignmentId } = req.params;

        const submissions = await prisma.submission.findMany({
            where: {
                assignmentId,
                studentId,
            },
            orderBy: { submittedAt: "desc" },
            include: {
                appeal: true,
            },
        });

        return res.json({ success: true, data: submissions });
    } catch (error) {
        console.error("Lỗi getMySubmissions:", error);
        return res.status(500).json({ success: false, message: "Server error retrieving submission history." });
    }
};

// 3. Xem chi tiết bài nộp & kết quả chấm (Dùng cho Wireframe 6.7.3)
export const getSubmissionResult = async (req: Request, res: Response) => {
    try {
        const { submissionId } = req.params;
        const requestingUser = req.user;

        // Kiểm tra IDOR: sinh viên chỉ xem bài của chính mình
        const ownerCheck = await prisma.submission.findUnique({
            where: { id: submissionId },
            select: { studentId: true },
        });
        if (!ownerCheck) {
            return res.status(404).json({ success: false, message: "Submission result not found." });
        }
        if (requestingUser?.role === "STUDENT" && ownerCheck.studentId !== requestingUser.userId) {
            return res.status(403).json({ success: false, message: "You are not authorized to view this submission." });
        }

        const submission = await prisma.submission.findUnique({
            where: { id: submissionId },
            include: {
                assignment: { select: { title: true, language: true, testCases: true } },
                student: { include: { user: { select: { fullName: true, email: true } } } },
                appeal: true,
                // Fingerprint: chỉ Giảng viên/Admin mới thấy dữ liệu thô
                fingerprint: requestingUser?.role === "STUDENT" ? false : true,
                // Plagiarism matches: fetch rồi lọc theo role bên dưới
                plagiarismMatches1: true,
                plagiarismMatches2: true,
            },
        });

        if (!submission) {
            return res.status(404).json({ success: false, message: "Submission result not found." });
        }

        /**
         * ADR-001 §8 — Bảo vệ quyền riêng tư:
         * - STUDENT: chỉ thấy mức độ (level), % tương đồng, KHÔNG thấy:
         *     + matched_fragments (số dòng code của bài đối chiếu)
         *     + submission_1_id / submission_2_id (danh tính bài kia)
         * - LECTURER / ADMIN: thấy đầy đủ
         */
        const sanitizePlagiarismForStudent = (matches: any[]) =>
            matches.map(({ similarityPercent, id }) => ({
                id,
                similarityPercent,
                // Ẩn: submission1Id, submission2Id, matchedFragments
            }));

        const isStudent = requestingUser?.role === "STUDENT";
        let parsedTestResults: unknown[] = [];
        if (submission.testResults) {
            try {
                const decoded = JSON.parse(submission.testResults);
                parsedTestResults = Array.isArray(decoded) ? decoded : [];
            } catch {
                parsedTestResults = [];
            }
        }

        const responseData = {
            ...submission,
            testResults: parsedTestResults,
            plagiarismMatches1: isStudent
                ? sanitizePlagiarismForStudent(submission.plagiarismMatches1)
                : submission.plagiarismMatches1,
            plagiarismMatches2: isStudent
                ? sanitizePlagiarismForStudent(submission.plagiarismMatches2)
                : submission.plagiarismMatches2,
        };

        return res.json({ success: true, data: responseData });
    } catch (error) {
        console.error("Lỗi getSubmissionResult:", error);
        return res.status(500).json({ success: false, message: "Server error retrieving submission result." });
    }
};

// 4. Sinh viên gửi đơn Khiếu nại điểm số (US05)
export const createAppeal = async (req: Request, res: Response) => {
    try {
        const studentId = req.user?.userId;
        const { submissionId, reason } = req.body;

        if (!studentId || !submissionId || !reason) {
            return res.status(400).json({ success: false, message: "Please provide a reason for the appeal." });
        }

        const existingAppeal = await prisma.appeal.findUnique({
            where: { submissionId },
        });

        if (existingAppeal) {
            return res.status(400).json({ success: false, message: "An appeal has already been submitted for this submission." });
        }

        const appeal = await prisma.appeal.create({
            data: {
                submissionId,
                studentId,
                reason,
                status: "PENDING",
            },
        });

        return res.status(201).json({
            success: true,
            message: "Appeal submitted successfully!",
            data: appeal,
        });
    } catch (error) {
        console.error("Lỗi createAppeal:", error);
        return res.status(500).json({ success: false, message: "Server error submitting appeal." });
    }
};

// 5. Giảng viên giải quyết khiếu nại & Bắt buộc lưu Audit Log nếu sửa điểm (Risk R03 & US10)
export const resolveAppeal = async (req: Request, res: Response) => {
    try {
        const lecturerId = req.user?.userId;
        const { appealId } = req.params;
        const { status, lecturerResponse, newScore, reasonForScoreChange } = req.body;

        if (!lecturerId) {
            return res.status(401).json({ success: false, message: "Unauthorized." });
        }

        const appeal = await prisma.appeal.findUnique({
            where: { id: appealId },
            include: { submission: true },
        });

        if (!appeal) {
            return res.status(404).json({ success: false, message: "Appeal not found." });
        }

        // Xử lý bằng Transaction để đảm bảo tính toàn vẹn (Risk R03)
        await prisma.$transaction(async (tx) => {
            // 1. Cập nhật trạng thái Appeal
            await tx.appeal.update({
                where: { id: appealId },
                data: {
                    status: status || "RESOLVED",
                    lecturerResponse,
                    resolvedBy: lecturerId,
                    resolvedAt: new Date(),
                },
            });

            // 2. Nếu có thay đổi điểm số -> Cập nhật Submission và ghi SCORE_AUDIT_LOGS
            if (newScore !== undefined && newScore !== null) {
                const oldScore = appeal.submission.totalScore;

                await tx.submission.update({
                    where: { id: appeal.submissionId },
                    data: { totalScore: Number(newScore) },
                });

                // Bắt buộc ghi log sửa điểm theo Risk R03
                await tx.scoreAuditLog.create({
                    data: {
                        submissionId: appeal.submissionId,
                        editorId: lecturerId,
                        oldScore: oldScore,
                        newScore: Number(newScore),
                        reason: reasonForScoreChange || lecturerResponse || "Adjusted after score appeal",
                    },
                });
            }
        });

        return res.json({
            success: true,
            message: "Appeal resolved successfully!",
        });
    } catch (error) {
        console.error("Lỗi resolveAppeal:", error);
        return res.status(500).json({ success: false, message: "Server error resolving appeal." });
    }
};

// Lấy danh sách các đơn khiếu nại chờ duyệt (Lecturer)
export const getPendingAppeals = async (req: Request, res: Response) => {
    try {
        const user = req.user!;

        const appeals = await prisma.appeal.findMany({
            where: {
                status: "PENDING",
                ...(user.role === "LECTURER" && {
                    submission: {
                        assignment: {
                            class: {
                                lecturerId: user.userId,
                            },
                        },
                    },
                }),
            },
            include: {
                submission: {
                    include: {
                        assignment: { select: { title: true } },
                    },
                },
                student: {
                    include: { user: { select: { fullName: true, email: true } } },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        return res.json({ success: true, data: appeals });
    } catch (error) {
        console.error("Lỗi getPendingAppeals:", error);
        return res.status(500).json({ success: false, message: "Server error retrieving pending appeals." });
    }
};


// API Endpoint cho Phân hệ 2 (Sandbox), 4 (AST), 5 (Queue) cập nhật kết quả chấm
export const updateSubmissionGradingResult = async (req: Request, res: Response) => {
    try {
        const internalKey = req.headers["x-internal-key"];
        if (internalKey !== env.INTERNAL_API_KEY) {
            return res.status(403).json({ success: false, message: "Access denied: Invalid or missing Internal API Key." });
        }

        const { submissionId } = req.params;
        const { status, totalScore, aiFeedback, step, progressPercent, message } = req.body;

        // 1. Validate trạng thái hợp lệ
        // Bao gồm AI_REVIEW_PENDING (Milestone 3) và COMPLETED (mapped từ GRADED)
        const ALLOWED_STATUS = [
            "PENDING", "QUEUED", "RUNNING_TESTS",
            "GRADED", "AI_REVIEW_PENDING",            // Từ queue-worker
            "COMPILATION_ERROR", "TIMEOUT", "SECURITY_VIOLATION",
            "COMPLETED",                              // Trạng thái hoàn tất trong DB
        ];
        if (status && !ALLOWED_STATUS.includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid grading status." });
        }

        // 2. Validate điểm số (Thống nhất chuẩn thang điểm 10)
        if (totalScore !== undefined && totalScore !== null) {
            const scoreNum = Number(totalScore);
            if (!Number.isFinite(scoreNum) || scoreNum < 0 || scoreNum > 10) {
                return res.status(400).json({ success: false, message: "Invalid score (Must be between 0 and 10)." });
            }
        }

        // 3. Kiểm tra bài nộp tồn tại
        const currentSubmission = await prisma.submission.findUnique({
            where: { id: submissionId },
            select: { id: true, status: true },
        });

        if (!currentSubmission) {
            return res.status(404).json({ success: false, message: "Submission not found." });
        }

        // Map trạng thái từ queue-worker sang trạng thái DB chuẩn mà frontend hiểu
        // GRADED / AI_REVIEW_PENDING → COMPLETED (pipeline chấm hoàn tất)
        const dbStatus = status === "GRADED" || status === "AI_REVIEW_PENDING"
            ? "COMPLETED"
            : status;

        const updated = await prisma.submission.update({
            where: { id: submissionId },
            data: {
                ...(dbStatus && { status: dbStatus }),
                ...(totalScore !== undefined && totalScore !== null && { totalScore: Number(totalScore) }),
                ...(aiFeedback && { aiFeedback }),
            },
        });

        // Phát WebSocket real-time cho sinh viên đang xem Stepper
        if (step) {
            emitGradingProgress({
                submissionId,
                step,
                progressPercent: progressPercent || 100,
                message: message || "Processing results...",
            });
        }

        return res.json({ success: true, message: "Grading result updated successfully!", data: updated });
    } catch (error) {
        console.error("Lỗi updateSubmissionGradingResult:", error);
        return res.status(500).json({ success: false, message: "Server error updating submission result." });
    }
};