import { Request, Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { prisma } from "../prisma.js";
import JSZip from "jszip";
import { emitGradingProgress, getSocketServer } from "../socket/index.js";
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
            // Do not return raw testResults JSON here: it contains hidden test data.
            select: {
                id: true,
                assignmentId: true,
                status: true,
                totalScore: true,
                automaticScore: true,
                manualScore: true,
                submittedAt: true,
                astCheckStatus: true,
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
        if (requestingUser?.role === "LECTURER") {
            const { allowed, submission, error } = await verifyLecturerOwnership(
                submissionId, requestingUser.userId, requestingUser.role
            );
            if (!allowed || !submission) {
                return res.status(submission ? 403 : 404).json({ success: false, message: error });
            }
        }

        const isStudent = requestingUser?.role === "STUDENT";
        const submission = await prisma.submission.findUnique({
            where: { id: submissionId },
            include: {
                assignment: {
                    select: {
                        title: true,
                        language: true,
                        testCases: true,
                    },
                },
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

        // Load optional lecturer comments separately. If the database has not yet
        // applied the nullable comment-column migration, keep the student result
        // page available and omit feedback until the migration is deployed.
        let lecturerAuditLogs: Array<{
            id: string;
            comment: string | null;
            newScore: number;
            createdAt: Date;
            editor: { fullName: string } | null;
        }> = [];
        try {
            lecturerAuditLogs = await prisma.scoreAuditLog.findMany({
                where: { submissionId },
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    comment: true,
                    newScore: true,
                    createdAt: true,
                    editor: { select: { fullName: true } },
                },
            });
        } catch (auditLogError) {
            console.warn(
                "[getSubmissionResult] Lecturer feedback is unavailable; check the score_audit_logs.comment migration:",
                auditLogError
            );
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

        // Students receive assignment metadata only. Never send configured test
        // cases or per-test execution results to the browser, including public
        // test cases: the grading details are reserved for lecturer/admin views.
        const visibleAssignment = isStudent && submission.assignment
            ? {
                title: submission.assignment.title,
                language: submission.assignment.language,
            }
            : submission.assignment;

        let parsedTestResults: any[] = [];
        const rawTestResults = (submission as any).testResults;
        if (!isStudent && rawTestResults) {
            try {
                const decoded = JSON.parse(rawTestResults);
                parsedTestResults = Array.isArray(decoded) ? decoded : [];
            } catch {
                parsedTestResults = [];
            }
        }

        const responseData = {
            ...submission,
            assignment: visibleAssignment,
            testResults: isStudent ? [] : parsedTestResults,
            lecturerFeedback: lecturerAuditLogs
                .filter((entry) => typeof entry.comment === "string" && entry.comment.trim().length > 0)
                .map((entry) => ({
                    id: entry.id,
                    comment: entry.comment as string,
                    score: entry.newScore,
                    createdAt: entry.createdAt,
                    lecturerName: entry.editor?.fullName ?? "Lecturer",
                })),
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

        const targetSubmission = await prisma.submission.findUnique({
            where: { id: submissionId },
            select: { id: true, studentId: true },
        });
        if (!targetSubmission) {
            return res.status(404).json({ success: false, message: "Submission not found." });
        }
        if (targetSubmission.studentId !== studentId) {
            return res.status(403).json({ success: false, message: "You can only appeal your own submission." });
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

        const { allowed, submission: ownedSubmission, error: ownershipError } = await verifyLecturerOwnership(
            appeal.submissionId, lecturerId, req.user?.role || "LECTURER"
        );
        if (!allowed || !ownedSubmission) {
            return res.status(ownedSubmission ? 403 : 404).json({ success: false, message: ownershipError });
        }
        if (status && !["RESOLVED", "REJECTED", "APPROVED"].includes(String(status))) {
            return res.status(400).json({ success: false, message: "Invalid appeal status." });
        }
        if (newScore !== undefined && newScore !== null) {
            const score = Number(newScore);
            if (!Number.isFinite(score) || score < 0 || score > 10) {
                return res.status(400).json({ success: false, message: "newScore must be between 0 and 10." });
            }
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
                const current = await tx.submission.findUnique({
                    where: { id: appeal.submissionId },
                    select: { totalScore: true },
                });
                const oldScore = current?.totalScore ?? null;

                await tx.submission.update({
                    where: { id: appeal.submissionId },
                    data: { manualScore: Number(newScore), totalScore: Number(newScore) },
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

        if (newScore !== undefined && newScore !== null) {
            getSocketServer()?.to(`submission_${appeal.submissionId}`).emit("score_updated", {
                submissionId: appeal.submissionId,
                newScore: Number(newScore),
            });
        }

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
        const { status, totalScore, aiFeedback, testResults, step, progressPercent, message } = req.body;

        // 1. Validate status value
        // Includes AI_REVIEW_PENDING (Milestone 3) and COMPLETED (mapped from GRADED)
        const ALLOWED_STATUS = [
            "PENDING", "QUEUED", "RUNNING_TESTS",
            "GRADED", "AI_REVIEW_PENDING",            // From queue-worker
            "COMPILATION_ERROR", "TIMEOUT", "SECURITY_VIOLATION",
            "COMPLETED",                              // Final status in DB
            "DEADLINE_EXCEEDED",
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
            select: { id: true, status: true, manualScore: true },
        });

        if (!currentSubmission) {
            return res.status(404).json({ success: false, message: "Submission not found." });
        }

        // Map queue-worker status to normalized DB status that frontend understands
        // GRADED / AI_REVIEW_PENDING → COMPLETED (grading pipeline finished)
        const dbStatus = status === "GRADED" || status === "AI_REVIEW_PENDING"
            ? "COMPLETED"
            : status;

        const updateData: any = {
            ...(dbStatus && { status: dbStatus }),
            ...(aiFeedback && { aiFeedback }),
        };
        if (totalScore !== undefined && totalScore !== null) {
            updateData.automaticScore = Number(totalScore);
        }
        if (Array.isArray(testResults)) {
            updateData.testResults = JSON.stringify(testResults);
        }
        const updated = await prisma.submission.update({ where: { id: submissionId }, data: updateData });
        if (totalScore !== undefined && totalScore !== null && currentSubmission.manualScore == null) {
            // Conditional write prevents a late automatic result from replacing a lecturer's override.
            await prisma.submission.updateMany({
                where: { id: submissionId, manualScore: null },
                data: { totalScore: Number(totalScore) },
            });
        }
        const latest = await prisma.submission.findUnique({ where: { id: submissionId } });

        // Emit real-time WebSocket update to students viewing the grading stepper
        if (step) {
            emitGradingProgress({
                submissionId,
                step,
                progressPercent: progressPercent || 100,
                message: message || "Processing results...",
            });
        }

        return res.json({ success: true, message: "Grading result updated successfully!", data: latest || updated });
    } catch (error) {
        console.error("[updateSubmissionGradingResult] Error:", error);
        return res.status(500).json({ success: false, message: "Server error updating submission result." });
    }
};

// =========================================================================
// Manual Review & Regrading APIs
// =========================================================================

// Helper: Determine language from file extension
function getLanguageFromExt(ext: string): string {
    const map: Record<string, string> = {
        ".java": "java",
        ".py": "python",
        ".cs": "csharp",
        ".js": "javascript",
        ".ts": "typescript",
        ".cpp": "cpp",
        ".c": "c",
    };
    return map[ext] ?? "text";
}

// Allowed source file extensions (text-based, readable)
const ALLOWED_EXTENSIONS = new Set([
    ".java", ".py", ".cs", ".js", ".ts", ".cpp", ".c", ".h",
    ".txt", ".md", ".json", ".xml", ".html", ".css",
]);

// Helper: Verify that the requesting lecturer owns the assignment's class.
// ADMIN bypasses this check (always returns true).
async function verifyLecturerOwnership(
    submissionId: string,
    userId: string,
    role: string
): Promise<{ allowed: boolean; submission: any | null; error?: string }> {
    const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: {
            assignment: {
                include: {
                    class: { select: { lecturerId: true } },
                },
            },
            student: {
                include: { user: { select: { fullName: true, email: true } } },
            },
        },
    });

    if (!submission) {
        return { allowed: false, submission: null, error: "Submission not found." };
    }

    if (role !== "ADMIN") {
        const lecturerId = submission.assignment?.class?.lecturerId;
        if (lecturerId !== userId) {
            return {
                allowed: false,
                submission,
                error: "You are not authorized to access this submission.",
            };
        }
    }

    return { allowed: true, submission };
}

// 6. View source code files inside a submission ZIP (Manual Review)
export const getSubmissionSourceCode = async (req: Request, res: Response) => {
    try {
        const { submissionId } = req.params;
        const user = req.user!;

        const { allowed, submission, error } = await verifyLecturerOwnership(
            submissionId,
            user.userId,
            user.role
        );

        if (!allowed || !submission) {
            return res.status(submission ? 403 : 404).json({ success: false, message: error });
        }

        if (!submission.fileUrl) {
            return res.status(404).json({ success: false, message: "No file associated with this submission." });
        }

        const uploadRoot = path.resolve(process.cwd(), "uploads", "submissions");
        const absolutePath = path.resolve(process.cwd(), submission.fileUrl.replace(/^\//, ""));
        if (!absolutePath.startsWith(uploadRoot + path.sep) || !fs.existsSync(absolutePath)) {
            return res.status(404).json({ success: false, message: "Submission file not found on server." });
        }

        const zipBuffer = fs.readFileSync(absolutePath);
        const zip = await JSZip.loadAsync(zipBuffer);

        const files: { name: string; path: string; content: string; language: string }[] = [];

        for (const [filePath, zipEntry] of Object.entries(zip.files)) {
            if (zipEntry.dir) continue;

            const ext = path.extname(filePath).toLowerCase();
            if (!ALLOWED_EXTENSIONS.has(ext)) continue;

            // Skip binary or oversized files (> 100KB)
            const fileData = await zipEntry.async("nodebuffer");
            if (fileData.byteLength > 100 * 1024) continue;

            // Skip non-UTF-8 text (heuristic: check for null bytes)
            if (fileData.includes(0x00)) continue;

            const content = fileData.toString("utf-8");
            const name = path.basename(filePath);
            const language = getLanguageFromExt(ext);

            files.push({ name, path: filePath, content, language });
        }

        const studentName = submission.student?.user?.fullName ?? "Unknown";

        // Reuse the test cases configured on this assignment and the results already
        // persisted by the Sandbox for this exact submission. Never create or rerun tests here.
        let persistedResults: any[] = [];
        if (submission.testResults) {
            try {
                const parsed = JSON.parse(submission.testResults);
                persistedResults = Array.isArray(parsed) ? parsed : [];
            } catch (parseError) {
                console.warn(`[getSubmissionSourceCode] Invalid persisted testResults for ${submissionId}:`, parseError);
            }
        }

        const assignmentWithTestCases = await prisma.assignment.findUnique({
            where: { id: submission.assignmentId },
            include: { testCases: true },
        });
        const configuredTestCases = assignmentWithTestCases?.testCases ?? [];
        const resultByTestCaseId = new Map<string, any>(
            persistedResults
                .filter((result: any) => typeof result?.testCaseId === "string")
                .map((result: any): [string, any] => [result.testCaseId, result])
        );
        const testCaseReviews = configuredTestCases.map((testCase: any, index: number) => {
            const result = resultByTestCaseId.get(testCase.id) ?? persistedResults[index] ?? null;
            const passed = typeof result?.passed === "boolean" ? result.passed : null;
            const errorType = result?.errorType ?? null;
            const submissionTerminalStatus = [
                "COMPILATION_ERROR", "COMPILE_ERROR", "TIMEOUT", "MEMORY_LIMIT_EXCEEDED",
                "RUNTIME_ERROR", "SECURITY_VIOLATION",
            ].includes(String(submission.status).toUpperCase())
                ? String(submission.status).toUpperCase()
                : null;
            const status = result?.status
                ?? (errorType || submissionTerminalStatus ? (errorType || submissionTerminalStatus!)
                    : passed === true ? "PASSED" : passed === false ? "FAILED" : "NOT_RUN");

            return {
                testCaseId: testCase.id,
                scoreWeight: result?.scoreWeight ?? testCase.scoreWeight,
                isHidden: Boolean(testCase.isHidden || result?.isHidden),
                inputData: result?.inputData ?? testCase.inputData ?? "",
                expectedOutput: result?.expectedOutput ?? testCase.expectedOutput ?? "",
                actualOutput: result?.actualOutput ?? "",
                passed,
                status,
                errorType,
                error: result?.error ?? null,
                durationMs: result?.durationMs ?? null,
            };
        });

        return res.json({
            success: true,
            data: {
                submissionId,
                studentName,
                files,
                submissionStatus: submission.status,
                automaticScore: submission.automaticScore,
                manualScore: submission.manualScore,
                totalScore: submission.totalScore,
                testCaseReviews,
            },
        });
    } catch (error) {
        console.error("[getSubmissionSourceCode] Error:", error);
        return res.status(500).json({ success: false, message: "Server error reading submission source code." });
    }
};

// 7. Download the raw submission ZIP file
export const downloadSubmissionZip = async (req: Request, res: Response) => {
    try {
        const { submissionId } = req.params;
        const user = req.user!;

        const { allowed, submission, error } = await verifyLecturerOwnership(
            submissionId,
            user.userId,
            user.role
        );

        if (!allowed || !submission) {
            return res.status(submission ? 403 : 404).json({ success: false, message: error });
        }

        if (!submission.fileUrl) {
            return res.status(404).json({ success: false, message: "No file associated with this submission." });
        }

        const uploadRoot = path.resolve(process.cwd(), "uploads", "submissions");
        const absolutePath = path.resolve(process.cwd(), submission.fileUrl.replace(/^\//, ""));
        if (!absolutePath.startsWith(uploadRoot + path.sep) || !fs.existsSync(absolutePath)) {
            return res.status(404).json({ success: false, message: "Submission file not found on server." });
        }

        return res.download(absolutePath, "submission.zip");
    } catch (error) {
        console.error("[downloadSubmissionZip] Error:", error);
        return res.status(500).json({ success: false, message: "Server error downloading submission." });
    }
};

// 8. Manually regrade a submission (override AI score) — Risk R03
export const manualRegrade = async (req: Request, res: Response) => {
    try {
        const { submissionId } = req.params;
        const user = req.user!;
        const { newScore, reason, comment } = req.body;

        // Validate input
        if (newScore === undefined || newScore === null) {
            return res.status(400).json({ success: false, message: "newScore is required." });
        }
        const scoreNum = Number(newScore);
        if (!Number.isFinite(scoreNum) || scoreNum < 0 || scoreNum > 10) {
            return res.status(400).json({ success: false, message: "newScore must be a number between 0 and 10." });
        }
        if (!reason || String(reason).trim() === "") {
            return res.status(400).json({ success: false, message: "reason is required." });
        }

        const { allowed, submission, error } = await verifyLecturerOwnership(
            submissionId,
            user.userId,
            user.role
        );

        if (!allowed || !submission) {
            return res.status(submission ? 403 : 404).json({ success: false, message: error });
        }

        let oldScore: number | null = null;

        await prisma.$transaction(async (tx) => {
            const current = await tx.submission.findUnique({
                where: { id: submissionId },
                select: { totalScore: true },
            });
            oldScore = current?.totalScore ?? null;

            await tx.submission.update({
                where: { id: submissionId },
                data: { manualScore: scoreNum, totalScore: scoreNum },
            });

            await tx.scoreAuditLog.create({
                data: {
                    submissionId,
                    editorId: user.userId,
                    oldScore,
                    newScore: scoreNum,
                    reason: String(reason).trim(),
                    comment: typeof comment === "string" && comment.trim() ? comment.trim() : null,
                },
            });
        });

        // Emit WebSocket event to clients watching this submission
        getSocketServer()
            ?.to(`submission_${submissionId}`)
            .emit("score_updated", { submissionId, newScore: scoreNum, oldScore });

        return res.json({
            success: true,
            message: "Score updated successfully.",
            data: { submissionId, oldScore, newScore: scoreNum },
        });
    } catch (error) {
        console.error("[manualRegrade] Error:", error);
        return res.status(500).json({ success: false, message: "Server error updating score." });
    }
};

// 9. Get score audit / grade history for a submission
export const getGradeHistory = async (req: Request, res: Response) => {
    try {
        const { submissionId } = req.params;
        const user = req.user!;

        // STUDENT can only view their own submission history
        if (user.role === "STUDENT") {
            const submission = await prisma.submission.findUnique({
                where: { id: submissionId },
                select: { studentId: true },
            });
            if (!submission) {
                return res.status(404).json({ success: false, message: "Submission not found." });
            }
            if (submission.studentId !== user.userId) {
                return res.status(403).json({ success: false, message: "You are not authorized to view this grade history." });
            }
        } else {
            // LECTURER/ADMIN: verify lecturer ownership
            const { allowed, submission, error } = await verifyLecturerOwnership(
                submissionId,
                user.userId,
                user.role
            );
            if (!allowed || !submission) {
                return res.status(submission ? 403 : 404).json({ success: false, message: error });
            }
        }

        const auditLogs = await prisma.scoreAuditLog.findMany({
            where: { submissionId },
            orderBy: { createdAt: "desc" },
            include: {
                editor: { select: { fullName: true, email: true } },
            },
        });

        return res.json({ success: true, data: auditLogs });
    } catch (error) {
        console.error("[getGradeHistory] Error:", error);
        return res.status(500).json({ success: false, message: "Server error retrieving grade history." });
    }
};
