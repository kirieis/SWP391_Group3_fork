/**
 * ast.service.ts — Service xử lý nghiệp vụ kiểm tra đạo văn AST/Winnowing
 *
 * Tách biệt hoàn toàn từ submission.controller.ts theo yêu cầu kiến trúc (HUONG_DAN §4 & can phan he 1 chot A3).
 *
 * Bản cập nhật 2026-10-11:
 *   - Lỗi 1 (Fix): Giải nén an toàn file .zip, lọc các file .java, loại bỏ package/import khi ghép,
 *                  chống path traversal & zip bomb, giới hạn ≤ 100.000 ký tự cho engine.
 *   - Lỗi 2 (Fix): Loại trừ bài nộp của chính sinh viên đó (studentId !== submission.studentId),
 *                  chỉ so với bài mới nhất của từng sinh viên khác cùng assignment.
 *   - Lỗi 3 (Fix): DANGER chỉ đặt trạng thái SCORE_WITHHELD (tạm giữ điểm để chờ Giảng viên xác nhận),
 *                  ghi ScoreAuditLog ghi chú lý do, KHÔNG tự động set newScore = 0.
 */

import fs from "fs";
import AdmZip from "adm-zip";
import { prisma } from "../prisma.js";
import { emitGradingProgress } from "../socket/index.js";
import { astClient, ASTSubmissionInput } from "./ast.client.js";

export interface ASTCheckResult {
    success: boolean;
    status: "DONE" | "NEEDS_REVIEW" | "FAILED";
    similarityPercent: number;
    isPlagiarism: boolean;
    matchedPairs: number;
    message?: string;
}

const MAX_ZIP_ENTRIES = 500;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 5 * 1024 * 1024; // 5MB chống zip bomb
const MAX_SOURCE_CHARS_FOR_ENGINE = 100_000; // Giới hạn của AST Engine

/**
 * Giải nén file .zip và ghép nội dung các file .java hợp lệ
 */
function extractJavaSourceFromZip(filePath: string): { sourceCode: string; error?: string } {
    try {
        // Nếu file trực tiếp là file .java (trường hợp kiểm thử)
        if (filePath.toLowerCase().endsWith(".java")) {
            const raw = fs.readFileSync(filePath, "utf-8");
            return { sourceCode: raw.slice(0, MAX_SOURCE_CHARS_FOR_ENGINE) };
        }

        const zip = new AdmZip(filePath);
        const entries = zip
            .getEntries()
            .filter(
                (e) =>
                    !e.isDirectory &&
                    e.entryName.toLowerCase().endsWith(".java") &&
                    !e.entryName.includes("..") // Chặn path traversal
            )
            .sort((a, b) => a.entryName.localeCompare(b.entryName)) // Thứ tự cố định
            .slice(0, MAX_ZIP_ENTRIES);

        if (entries.length === 0) {
            return {
                sourceCode: "",
                error: "File zip không chứa file nguồn .java hợp lệ nào.",
            };
        }

        let totalUncompressedSize = 0;
        const codeParts: string[] = [];

        for (const entry of entries) {
            totalUncompressedSize += entry.header.size;
            if (totalUncompressedSize > MAX_TOTAL_UNCOMPRESSED_BYTES) {
                console.warn("[astService] Vượt quá giới hạn dung lượng giải nén (5MB)");
                break;
            }

            const rawText = entry.getData().toString("utf-8");

            // Bỏ package và import: Khi ghép nhiều file .java vào 1 chuỗi, các dòng này
            // nằm ở giữa chuỗi sẽ làm Java ANTLR Parser báo lỗi cú pháp giả (engine vốn loại bỏ chúng)
            const cleanText = rawText
                .replace(/^\s*package\s+[\w.]+\s*;/gm, "")
                .replace(/^\s*import\s+[^;]+;/gm, "");

            codeParts.push(cleanText);
        }

        const combinedCode = codeParts.join("\n\n").trim();
        if (!combinedCode) {
            return { sourceCode: "", error: "Nội dung code sau khi lọc rỗng." };
        }

        return {
            sourceCode: combinedCode.slice(0, MAX_SOURCE_CHARS_FOR_ENGINE),
        };
    } catch (err: any) {
        console.error(`[astService] Lỗi giải nén file ${filePath}:`, err?.message);
        return { sourceCode: "", error: `Không thể đọc/giải nén file zip: ${err?.message}` };
    }
}

export const astService = {
    /**
     * Thực thi toàn bộ pipeline kiểm tra AST cho một bài nộp
     */
    async check(submissionId: string, filePath?: string): Promise<ASTCheckResult> {
        try {
            // Lấy thông tin bài nộp và assignment
            const submission = await prisma.submission.findUnique({
                where: { id: submissionId },
                include: { assignment: true },
            });

            if (!submission) {
                console.error(`[astService] Submission không tồn tại: ${submissionId}`);
                return {
                    success: false,
                    status: "FAILED",
                    similarityPercent: 0,
                    isPlagiarism: false,
                    matchedPairs: 0,
                    message: "Submission not found",
                };
            }

            // Xác định đường dẫn file bài nộp trên đĩa
            const resolvedPath = filePath || submission.fileUrl;
            if (!resolvedPath || !fs.existsSync(resolvedPath)) {
                console.error(`[astService] File bài nộp không tìm thấy trên đĩa: ${resolvedPath}`);
                await prisma.submission.update({
                    where: { id: submissionId },
                    data: { astCheckStatus: "FAILED" },
                });
                return {
                    success: false,
                    status: "FAILED",
                    similarityPercent: 0,
                    isPlagiarism: false,
                    matchedPairs: 0,
                    message: "Submission file not found on disk",
                };
            }

            // ── Bước 1: Giải nén zip và trích xuất source code .java (Fix Lỗi 1) ──
            const { sourceCode, error: extractError } = extractJavaSourceFromZip(resolvedPath);

            if (extractError || !sourceCode) {
                console.warn(`[astService] Không trích xuất được code Java: ${extractError}`);
                await prisma.submission.update({
                    where: { id: submissionId },
                    data: { astCheckStatus: "FAILED" },
                });
                return {
                    success: false,
                    status: "FAILED",
                    similarityPercent: 0,
                    isPlagiarism: false,
                    matchedPairs: 0,
                    message: extractError || "Không tìm thấy code Java trong bài nộp",
                };
            }

            // ── Bước 2: Gọi engine POST /analyze ─────────────────────────────────
            const analyzeResult = await astClient.analyze(submissionId, sourceCode);

            if (!analyzeResult) {
                // Engine lỗi 5xx hoặc timeout: cập nhật FAILED
                await prisma.submission.update({
                    where: { id: submissionId },
                    data: { astCheckStatus: "FAILED" },
                });
                return {
                    success: false,
                    status: "FAILED",
                    similarityPercent: 0,
                    isPlagiarism: false,
                    matchedPairs: 0,
                    message: "Engine analysis failed or timed out",
                };
            }

            // Kiểm tra xem bài có cần giảng viên xem tay không (fallback lex hoặc có warnings)
            const needsManualReview =
                analyzeResult.analysis_mode === "lex" ||
                (analyzeResult.warnings && analyzeResult.warnings.length > 0) ||
                analyzeResult.fallback_reason !== null;

            // ── Bước 3: Lưu fingerprint và metadata vào DB ───────────────────────
            await prisma.aSTFingerprint.upsert({
                where: { submissionId },
                create: {
                    submissionId,
                    fingerprintData: JSON.stringify(analyzeResult.fingerprint),
                    analysisMode: analyzeResult.analysis_mode,
                    fallbackReason: analyzeResult.fallback_reason,
                    warnings: JSON.stringify(analyzeResult.warnings || []),
                },
                update: {
                    fingerprintData: JSON.stringify(analyzeResult.fingerprint),
                    analysisMode: analyzeResult.analysis_mode,
                    fallbackReason: analyzeResult.fallback_reason,
                    warnings: JSON.stringify(analyzeResult.warnings || []),
                },
            });

            // ── Bước 4: Lấy fingerprint các bài khác cùng assignment (Fix Lỗi 2) ──
            // Loại trừ bài của CHÍNH sinh viên này (studentId !== submission.studentId)
            const otherSubmissions = await prisma.submission.findMany({
                where: {
                    assignmentId: submission.assignmentId,
                    id: { not: submissionId },
                    studentId: { not: submission.studentId }, // Chống so với chính mình khi nộp lại
                    fingerprint: { isNot: null },
                },
                orderBy: { submittedAt: "desc" },
                include: { fingerprint: true },
            });

            // Chỉ giữ lại bài mới nhất của từng sinh viên khác để tránh phình bảng match
            const latestSubmissionsByStudent = new Map<string, typeof otherSubmissions[0]>();
            for (const sub of otherSubmissions) {
                if (!latestSubmissionsByStudent.has(sub.studentId)) {
                    latestSubmissionsByStudent.set(sub.studentId, sub);
                }
            }
            const siblingSubmissions = Array.from(latestSubmissionsByStudent.values());

            let maxSimilarity = 0;
            let hasDanger = false;
            let matchCount = 0;

            if (siblingSubmissions.length > 0) {
                // Chuẩn bị danh sách gửi so sánh batch
                const batchInputs: ASTSubmissionInput[] = [
                    {
                        submission_id: submissionId,
                        fingerprint: analyzeResult.fingerprint,
                    },
                    ...siblingSubmissions.map((s) => ({
                        submission_id: s.id,
                        fingerprint: JSON.parse(s.fingerprint!.fingerprintData),
                    })),
                ];

                // ── Bước 5: Gọi POST /compare/batch ──────────────────────────────
                const batchResult = await astClient.compareBatch(batchInputs, {
                    minPercent: 30,
                    with_fragments: true,
                });

                if (batchResult && batchResult.matches.length > 0) {
                    // Lọc các cặp có bài nộp hiện tại
                    const currentMatches = batchResult.matches.filter(
                        (m) => m.submission_1_id === submissionId || m.submission_2_id === submissionId
                    );

                    matchCount = currentMatches.length;

                    for (const match of currentMatches) {
                        if (match.similarity_percent > maxSimilarity) {
                            maxSimilarity = match.similarity_percent;
                        }

                        // ── Bước 6: Chuẩn hóa ID nhỏ trước và đảo a_lines ↔ b_lines nếu ngược ──
                        const isReversed = match.submission_1_id > match.submission_2_id;
                        const [s1, s2] = [match.submission_1_id, match.submission_2_id].sort();

                        let fragments = match.matched_fragments || [];
                        if (isReversed) {
                            fragments = fragments.map((f) => ({
                                a_lines: f.b_lines,
                                b_lines: f.a_lines,
                            }));
                        }

                        await prisma.plagiarismMatch.upsert({
                            where: { submission1Id_submission2Id: { submission1Id: s1, submission2Id: s2 } },
                            create: {
                                submission1Id: s1,
                                submission2Id: s2,
                                similarityPercent: match.similarity_percent,
                                level: match.level,
                                mode: match.mode,
                                matchedFragments: JSON.stringify(fragments),
                            },
                            update: {
                                similarityPercent: match.similarity_percent,
                                level: match.level,
                                mode: match.mode,
                                matchedFragments: JSON.stringify(fragments),
                            },
                        });

                        // ── Bước 7: Cặp DANGER → Giữ điểm chờ Giảng viên xác nhận (Fix Lỗi 3) ──
                        if (match.level === "DANGER" && match.flag === "PLAGIARISM_DETECTED") {
                            hasDanger = true;
                            const peerId = [s1, s2].find((id) => id !== submissionId);

                            await prisma.$transaction(async (tx) => {
                                // Tạm giữ điểm số của bài nộp nghi vấn
                                await tx.submission.update({
                                    where: { id: submissionId },
                                    data: { status: "SCORE_WITHHELD" },
                                });

                                // Ghi log kiểm toán: Giữ nguyên điểm cũ, không tự gán 0 điểm trước khi GV duyệt
                                await tx.scoreAuditLog.create({
                                    data: {
                                        submissionId,
                                        editorId: "system",
                                        oldScore: submission.totalScore,
                                        newScore: submission.totalScore ?? 0, // Giữ điểm hiện có, chờ GV quyết định
                                        reason: `Nghi ngờ đạo văn (${match.similarity_percent.toFixed(1)}% với bài ${peerId}) — Hệ thống tạm giữ điểm chờ Giảng viên xác nhận.`,
                                    },
                                });
                            });

                            emitGradingProgress({
                                submissionId,
                                step: "AST_ANALYSIS",
                                progressPercent: 100,
                                message: `Phát hiện tương đồng cao (${match.similarity_percent.toFixed(1)}%). Điểm tạm giữ để Giảng viên kiểm tra đối chiếu.`,
                            });
                        }
                    }
                }
            }

            // ── Bước 8: Đánh dấu DONE hoặc NEEDS_REVIEW ──────────────────────────
            const finalStatus = needsManualReview ? "NEEDS_REVIEW" : "DONE";
            await prisma.submission.update({
                where: { id: submissionId },
                data: { astCheckStatus: finalStatus },
            });

            emitGradingProgress({
                submissionId,
                step: "AST_ANALYSIS",
                progressPercent: 100,
                message: needsManualReview
                    ? "Kiểm tra AST hoàn tất (có cảnh báo cú pháp/độ tin cậy thấp, chờ duyệt)."
                    : "Kiểm tra AST hoàn tất: Không phát hiện vi phạm quy chế.",
            });

            return {
                success: true,
                status: finalStatus,
                similarityPercent: maxSimilarity,
                isPlagiarism: hasDanger,
                matchedPairs: matchCount,
            };
        } catch (error: any) {
            console.error(`[astService] Lỗi nghiêm trọng khi chạy check(${submissionId}):`, error?.message);
            await prisma.submission.update({
                where: { id: submissionId },
                data: { astCheckStatus: "FAILED" },
            }).catch(() => {});

            return {
                success: false,
                status: "FAILED",
                similarityPercent: 0,
                isPlagiarism: false,
                matchedPairs: 0,
                message: error?.message,
            };
        }
    },
};
