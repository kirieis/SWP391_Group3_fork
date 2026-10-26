import { Request, Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { prisma } from "../prisma.js";
import { emitGradingProgress } from "../socket/index.js";
import { env } from "../config/env.js";
import { astService } from "../services/ast.service.js";
import { gradingService } from "../services/grading.service.js";

// Maximum number of allowed submission attempts per student per assignment (Risk R01)
// SRS §8.3 Risk R01: "Limit to max 5 submissions per assignment per student."
const MAX_SUBMISSION_ATTEMPTS = 5;

// 1. Submit assignment (US12 & Risk R01)
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

        // 1. Verify assignment exists & check deadline
        const assignment = await prisma.assignment.findUnique({
            where: { id: assignmentId },
        });

        if (!assignment) {
            if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
            return res.status(404).json({ success: false, message: "Assignment not found." });
        }

        // Enforce the deadline on the server for both first submissions and resubmissions.
        // A missing deadline remains open; an expired upload is discarded before returning.
        if (assignment.deadline && Date.now() > new Date(assignment.deadline).getTime()) {
            if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
            return res.status(403).json({
                success: false,
                message: "The submission deadline has passed. Submissions and resubmissions are no longer accepted.",
            });
        }

        // 2. Enforce Risk R01: Count student's prior submissions for this assignment
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
        // 3. Compute SHA-256 hash of the uploaded file
        const fileBuffer = fs.readFileSync(file.path);
        const hashSum = crypto.createHash("sha256");
        hashSum.update(fileBuffer);
        const fileHash = hashSum.digest("hex");

        // 4. Validate ZIP magic bytes (50 4B 03 04) - Defensive security check beyond SRS
        if (fileBuffer.length < 4 || fileBuffer[0] !== 0x50 || fileBuffer[1] !== 0x4b || fileBuffer[2] !== 0x03 || fileBuffer[3] !== 0x04) {
            fs.unlinkSync(file.path); // Remove invalid file
            return res.status(400).json({ success: false, message: "Uploaded file is not a valid ZIP archive (Invalid magic bytes)." });
        }

        // 6. Create submission record with file path & AST_CHECK_STATUS = PENDING
        const submission = await prisma.submission.create({
            data: {
                assignmentId,
                studentId,
                fileUrl: `/uploads/submissions/${file.filename}`,
                fileHash,
                status: "PENDING",
                astCheckStatus: "PENDING", // ADR-001 §5: plagiarism check status
            },
        });

        // Emit initial progress notification via WebSocket
        emitGradingProgress({
            submissionId: submission.id,
            step: "QUEUED",
            progressPercent: 10,
            message: "Submission received and enqueued for grading.",
        });

        // 7. Run the full grading pipeline in the background (Sandbox -> AST -> AI Review -> Score finalization)
        // Use setImmediate to immediately return 202 Accepted to client per US12
        setImmediate(async () => {
            try {
                await gradingService.gradeSubmission(submission.id, file.path);
            } catch (err) {
                console.error("[Grading Pipeline] Unhandled error:", err);
            }
        });

        // Return 202 Accepted immediately per US12 specification
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
        console.error("[submitAssignment] Error:", error);
        return res.status(500).json({ success: false, message: "Server error during submission." });
    }
};

// 2. Get student's submission history for an assignment
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
        console.error("[getMySubmissions] Error:", error);
        return res.status(500).json({ success: false, message: "Server error retrieving submission history." });
    }
};

// 3. View submission details & grading result (Wireframe 6.7.3)
export const getSubmissionResult = async (req: Request, res: Response) => {
    try {
        const { submissionId } = req.params;
        const requestingUser = req.user;

        // IDOR check: students may only view their own submissions
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
         * ADR-001 §8 — Privacy protection:
         * - STUDENT: sees only similarity level & %, NOT:
         *     + matched_fragments (code lines from compared submission)
         *     + submission_1_id / submission_2_id (identities of other submissions)
         * - LECTURER / ADMIN: sees full data
         */
        const sanitizePlagiarismForStudent = (matches: any[]) =>
            matches.map(({ similarityPercent, id }) => ({
                id,
                similarityPercent,
                // Hidden: submission1Id, submission2Id, matchedFragments
            }));

        const isStudent = requestingUser?.role === "STUDENT";
        let parsedTestResults: unknown[] = [];
        const rawTestResults = (submission as any).testResults;
        if (rawTestResults) {
            try {
                const decoded = JSON.parse(rawTestResults);
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
        console.error("[getSubmissionResult] Error:", error);
        return res.status(500).json({ success: false, message: "Server error retrieving submission result." });
    }
};

// 4. Student submits a score appeal (US05)
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
        console.error("[createAppeal] Error:", error);
        return res.status(500).json({ success: false, message: "Server error submitting appeal." });
    }
};

// 5. Lecturer resolves appeal & must record Audit Log if score is changed (Risk R03 & US10)
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

        // Use transaction to ensure data integrity (Risk R03)
        await prisma.$transaction(async (tx) => {
            // 1. Update appeal status
            await tx.appeal.update({
                where: { id: appealId },
                data: {
                    status: status || "RESOLVED",
                    lecturerResponse,
                    resolvedBy: lecturerId,
                    resolvedAt: new Date(),
                },
            });

            // 2. If score changed -> Update submission and record SCORE_AUDIT_LOGS
            if (newScore !== undefined && newScore !== null) {
                const oldScore = appeal.submission.totalScore;

                await tx.submission.update({
                    where: { id: appeal.submissionId },
                    data: { totalScore: Number(newScore) },
                });

                // Mandatory score change audit log per Risk R03
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
        console.error("[resolveAppeal] Error:", error);
        return res.status(500).json({ success: false, message: "Server error resolving appeal." });
    }
};

// Get list of pending appeals (Lecturer view)
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
        console.error("[getPendingAppeals] Error:", error);
        return res.status(500).json({ success: false, message: "Server error retrieving pending appeals." });
    }
};


// API Endpoint for Subsystem 2 (Sandbox), 4 (AST), 5 (Queue) to update grading results
export const updateSubmissionGradingResult = async (req: Request, res: Response) => {
    try {
        const internalKey = req.headers["x-internal-key"];
        if (internalKey !== env.INTERNAL_API_KEY) {
            return res.status(403).json({ success: false, message: "Access denied: Invalid or missing Internal API Key." });
        }

        const { submissionId } = req.params;
        const { status, totalScore, aiFeedback, step, progressPercent, message } = req.body;

        // 1. Validate status value
        // Includes AI_REVIEW_PENDING (Milestone 3) and COMPLETED (mapped from GRADED)
        const ALLOWED_STATUS = [
            "PENDING", "QUEUED", "RUNNING_TESTS",
            "GRADED", "AI_REVIEW_PENDING",            // From queue-worker
            "COMPILATION_ERROR", "TIMEOUT", "SECURITY_VIOLATION",
            "COMPLETED",                              // Final status in DB
        ];
        if (status && !ALLOWED_STATUS.includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid grading status." });
        }

        // 2. Validate score (standardized 0-10 scale)
        if (totalScore !== undefined && totalScore !== null) {
            const scoreNum = Number(totalScore);
            if (!Number.isFinite(scoreNum) || scoreNum < 0 || scoreNum > 10) {
                return res.status(400).json({ success: false, message: "Invalid score (Must be between 0 and 10)." });
            }
        }

        // 3. Verify submission exists
        const currentSubmission = await prisma.submission.findUnique({
            where: { id: submissionId },
            select: { id: true, status: true },
        });

        if (!currentSubmission) {
            return res.status(404).json({ success: false, message: "Submission not found." });
        }

        // Map queue-worker status to normalized DB status that frontend understands
        // GRADED / AI_REVIEW_PENDING → COMPLETED (grading pipeline finished)
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

        // Emit real-time WebSocket update to students viewing the grading stepper
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
        console.error("[updateSubmissionGradingResult] Error:", error);
        return res.status(500).json({ success: false, message: "Server error updating submission result." });
    }
};