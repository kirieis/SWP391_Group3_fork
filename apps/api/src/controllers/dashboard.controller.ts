import { Request, Response } from "express";
import { prisma } from "../prisma.js";
import { withCache, CacheKey, TTL, invalidateByPattern } from "../services/cache.service.js";

// Lấy toàn bộ số liệu thống kê cho Lecturer Dashboard (US09 & Wireframe 6.7.4)
export const getLecturerAnalytics = async (req: Request, res: Response) => {
    try {
        const { assignmentId } = req.params;

        if (!assignmentId) {
            return res.status(400).json({ success: false, message: "Assignment ID is required." });
        }

        const requestedAssignment = await prisma.assignment.findUnique({
            where: { id: assignmentId },
            select: { id: true, classId: true, class: { select: { lecturerId: true } } },
        });
        if (!requestedAssignment) {
            return res.status(404).json({ success: false, message: "Assignment not found." });
        }
        if (req.user?.role === "LECTURER" && requestedAssignment.class.lecturerId !== req.user.userId) {
            return res.status(403).json({ success: false, message: "You can only view analytics for your own classes." });
        }

        // ━━━ CACHE-ASIDE: stats + plagiarism top-10 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const statsKey = CacheKey.dashboardStats(req.user?.userId ?? "system", assignmentId);

        const result = await withCache(statsKey, TTL.DASHBOARD_STATS, async () => {
            // ――― DB FETCH (chạy khi cache miss) ―――――――――――――――――――――――――――――――
            const assignment = await prisma.assignment.findUnique({
                where: { id: assignmentId },
                include: {
                    class: {
                        include: {
                            // Chỉ đếm sinh viên có status = ACTIVE (loại DROPPED theo SRS US09)
                            students: {
                                where: { status: "ACTIVE" },
                            },
                        },
                    },
                },
            });

            if (!assignment) return null;

            const totalActiveStudents = assignment.class.students.length;

            // 1. Lấy danh sách bài nộp của bài tập này
            const submissions = await prisma.submission.findMany({
                where: { assignmentId },
                select: {
                    id: true,
                    studentId: true,
                    totalScore: true,
                    status: true,
                },
            });

            // Số sinh viên duy nhất đã nộp bài
            const submittedStudentIds = new Set(submissions.map((s) => s.studentId));
            const submittedCount = submittedStudentIds.size;
            const submissionRate = totalActiveStudents > 0 ? Number(((submittedCount / totalActiveStudents) * 100).toFixed(1)) : 0;

            // 2. Thống kê phân bố điểm (Score Distribution)
            const scoreDistribution = {
                under5: 0,
                from5to65: 0,
                from65to8: 0,
                from8to10: 0,
            };

            let totalScoreSum = 0;
            let gradedCount = 0;

            for (const sub of submissions) {
                if (sub.totalScore !== null && sub.totalScore !== undefined) {
                    const score = sub.totalScore;
                    totalScoreSum += score;
                    gradedCount++;

                    if (score < 5) scoreDistribution.under5++;
                    else if (score < 6.5) scoreDistribution.from5to65++;
                    else if (score < 8) scoreDistribution.from65to8++;
                    else scoreDistribution.from8to10++;
                }
            }

            const averageScore = gradedCount > 0 ? Number((totalScoreSum / gradedCount).toFixed(2)) : 0;

            // 3. Top 10 cặp bài nộp có độ tương đồng đạo văn cao nhất (cache riêng phần này)
            const top10Key = CacheKey.plagiarismTop10(assignmentId);
            const topPlagiarismMatches = await withCache(top10Key, TTL.PLAGIARISM_TOP10, () =>
                prisma.plagiarismMatch.findMany({
                    where: { submission1: { assignmentId } },
                    orderBy: { similarityPercent: "desc" },
                    take: 10,
                    include: {
                        submission1: {
                            include: { student: { include: { user: { select: { fullName: true, email: true } } } } },
                        },
                        submission2: {
                            include: { student: { include: { user: { select: { fullName: true, email: true } } } } },
                        },
                    },
                })
            );

            return {
                assignment: {
                    id: assignment.id,
                    title: assignment.title,
                    language: assignment.language,
                    deadline: assignment.deadline,
                    classCode: assignment.class.classCode,
                },
                stats: {
                    totalActiveStudents,
                    submittedCount,
                    notSubmittedCount: Math.max(0, totalActiveStudents - submittedCount),
                    submissionRate,
                    averageScore,
                    scoreDistribution,
                },
                topPlagiarismMatches: topPlagiarismMatches.map((match) => ({
                    id: match.id,
                    similarityPercent: match.similarityPercent,
                    student1: {
                        studentCode: match.submission1.student.studentCode,
                        fullName: match.submission1.student.user.fullName,
                        submissionId: match.submission1Id,
                    },
                    student2: {
                        studentCode: match.submission2.student.studentCode,
                        fullName: match.submission2.student.user.fullName,
                        submissionId: match.submission2Id,
                    },
                })),
            };
        });

        if (!result) {
            return res.status(404).json({ success: false, message: "Assignment not found." });
        }

        // Fetch student score rows fresh on every request (not from the analytics cache),
        // so lecturers see the latest grading result for the selected assignment.
        const [activeEnrollments, latestSubmissions] = await Promise.all([
            prisma.classStudent.findMany({
                where: { classId: requestedAssignment.classId, status: "ACTIVE" },
                select: {
                    studentId: true,
                    student: {
                        select: {
                            studentCode: true,
                            user: { select: { fullName: true, email: true } },
                        },
                    },
                },
                orderBy: { student: { studentCode: "asc" } },
            }),
            prisma.submission.findMany({
                where: { assignmentId },
                orderBy: { submittedAt: "desc" },
                select: { id: true, studentId: true, totalScore: true, status: true, submittedAt: true },
            }),
        ]);
        const latestByStudent = new Map<string, typeof latestSubmissions[number]>();
        for (const submission of latestSubmissions) {
            if (!latestByStudent.has(submission.studentId)) latestByStudent.set(submission.studentId, submission);
        }
        const studentScores = activeEnrollments.map((enrollment) => {
            const submission = latestByStudent.get(enrollment.studentId);
            return {
                studentId: enrollment.studentId,
                studentCode: enrollment.student.studentCode,
                fullName: enrollment.student.user.fullName,
                email: enrollment.student.user.email,
                submissionId: submission?.id ?? null,
                submissionStatus: submission?.status ?? "NOT_SUBMITTED",
                score: submission?.totalScore ?? null,
                submittedAt: submission?.submittedAt ?? null,
                displayScore: submission?.totalScore != null ? Number(submission.totalScore.toFixed(2)) :
                    (Date.now() > new Date((result as any).assignment.deadline).getTime() && !submission ? "N/A" : null),
            };
        });

        return res.json({ success: true, data: { ...result, studentScores } });
    } catch (error) {
        console.error("Error getLecturerAnalytics:", error);
        return res.status(500).json({ success: false, message: "Server error getting statistics." });
    }
};
