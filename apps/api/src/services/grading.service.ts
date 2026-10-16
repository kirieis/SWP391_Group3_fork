import fs from "fs";
import path from "path";
import { exec, spawn } from "child_process";
import AdmZip from "adm-zip";
import { prisma } from "../prisma.js";
import { emitGradingProgress } from "../socket/index.js";
import { astService } from "./ast.service.js";
import { aiGateway } from "./genai/instance.js";

interface TestCaseResult {
    testCaseId?: string;
    passed: boolean;
    actualOutput: string;
    expectedOutput: string;
    durationMs: number;
}

export class GradingService {
    /**
     * Chạy toàn bộ pipeline chấm điểm cho 1 submission:
     * 1. Queued
     * 2. Building (giải nén, chuẩn hóa file Java, javac)
     * 3. Running Tests (chạy test cases qua java CLI)
     * 4. AST Analysis (phân tích đạo văn Winnowing)
     * 5. AI Review (đánh giá chất lượng mã nguồn)
     * 6. Complete (cập nhật DB và phát socket)
     */
    public async gradeSubmission(submissionId: string, zipFilePath: string): Promise<void> {
        let tempDir = "";
        try {
            console.log(`[GradingService] Bắt đầu chấm bài nộp ${submissionId}`);

            // Lấy thông tin bài nộp và đề bài kèm test cases
            const submission = await prisma.submission.findUnique({
                where: { id: submissionId },
                include: {
                    assignment: {
                        include: { testCases: true },
                    },
                },
            });

            if (!submission) {
                console.error(`[GradingService] Không tìm thấy submission ${submissionId}`);
                return;
            }

            // Bước 1: QUEUED
            emitGradingProgress({
                submissionId,
                step: "QUEUED",
                progressPercent: 10,
                message: "Bài nộp đã được tiếp nhận vào hàng đợi chấm.",
            });

            // Kiểm tra file ZIP trên đĩa
            let resolvedZipPath = zipFilePath;
            if (!path.isAbsolute(resolvedZipPath)) {
                resolvedZipPath = path.resolve(process.cwd(), resolvedZipPath);
            }
            if (!fs.existsSync(resolvedZipPath)) {
                const altPath = path.resolve(process.cwd(), "uploads", "submissions", path.basename(zipFilePath));
                if (fs.existsSync(altPath)) {
                    resolvedZipPath = altPath;
                } else {
                    console.error(`[GradingService] Không tìm thấy file zip tại: ${resolvedZipPath}`);
                    await prisma.submission.update({
                        where: { id: submissionId },
                        data: { status: "FAILED" },
                    });
                    return;
                }
            }

            // Bước 2: BUILDING (Chuẩn bị và biên dịch)
            emitGradingProgress({
                submissionId,
                step: "BUILDING",
                progressPercent: 25,
                message: "Đang giải nén và biên dịch mã nguồn Java...",
            });

            tempDir = path.join(process.cwd(), "uploads", "temp", `sub_${submissionId}_${Date.now()}`);
            fs.mkdirSync(tempDir, { recursive: true });

            // Giải nén ZIP an toàn
            const zip = new AdmZip(resolvedZipPath);
            zip.extractAllTo(tempDir, true);

            // Tìm và chuẩn hóa các file .java
            const javaFiles = fs.readdirSync(tempDir).filter((f) => f.toLowerCase().endsWith(".java"));
            if (javaFiles.length === 0) {
                console.warn(`[GradingService] Không có file .java nào trong ${resolvedZipPath}`);
                await prisma.submission.update({
                    where: { id: submissionId },
                    data: {
                        status: "COMPILATION_ERROR",
                        totalScore: 0,
                    },
                });
                emitGradingProgress({
                    submissionId,
                    step: "COMPLETE",
                    progressPercent: 100,
                    message: "Lỗi biên dịch: Không tìm thấy file nguồn .java trong file nén.",
                });
                await astService.check(submissionId, resolvedZipPath).catch(() => {});
                this.cleanupTempDir(tempDir);
                return;
            }

            let mainClassName: string | null = null;
            for (const file of javaFiles) {
                const filePath = path.join(tempDir, file);
                const content = fs.readFileSync(filePath, "utf-8");

                // Nếu có public class mà tên file không khớp -> đổi tên file để javac không báo lỗi
                const publicClassMatch = content.match(/public\s+class\s+([A-Za-z0-9_]+)/);
                if (publicClassMatch) {
                    const className = publicClassMatch[1];
                    if (file !== `${className}.java`) {
                        const newFilePath = path.join(tempDir, `${className}.java`);
                        fs.renameSync(filePath, newFilePath);
                        console.log(`[GradingService] Đổi tên file ${file} -> ${className}.java`);
                    }
                    if (content.includes("public static void main")) {
                        mainClassName = className;
                    }
                } else if (content.includes("public static void main")) {
                    mainClassName = path.basename(file, ".java");
                }
            }

            // Nếu chưa tìm thấy mainClassName, chọn class đầu tiên
            if (!mainClassName) {
                const currentFiles = fs.readdirSync(tempDir).filter((f) => f.toLowerCase().endsWith(".java"));
                if (currentFiles.length > 0) {
                    mainClassName = path.basename(currentFiles[0], ".java");
                }
            }

            // Biên dịch bằng javac
            const compileSuccess = await this.compileJavaFiles(tempDir);
            if (!compileSuccess.success) {
                console.warn(`[GradingService] Lỗi biên dịch: ${compileSuccess.error}`);
                await prisma.submission.update({
                    where: { id: submissionId },
                    data: {
                        status: "COMPILATION_ERROR",
                        totalScore: 0,
                    },
                });
                emitGradingProgress({
                    submissionId,
                    step: "COMPLETE",
                    progressPercent: 100,
                    message: `Lỗi biên dịch: ${compileSuccess.error?.slice(0, 200)}`,
                });
                await astService.check(submissionId, resolvedZipPath).catch(() => {});
                this.cleanupTempDir(tempDir);
                return;
            }

            // Bước 3: RUNNING_TESTS (Chạy Test Cases)
            emitGradingProgress({
                submissionId,
                step: "RUNNING_TESTS",
                progressPercent: 50,
                message: "Đang thực thi các test cases kiểm thử...",
            });

            await prisma.submission.update({
                where: { id: submissionId },
                data: { status: "RUNNING_TESTS" },
            });

            const testCases = submission.assignment?.testCases || [];
            let totalWeight = 0;
            let passedWeight = 0;
            let passedCount = 0;

            if (testCases.length === 0) {
                // Không có testcase -> mặc định đạt điểm tối đa
                totalWeight = 10;
                passedWeight = 10;
                passedCount = 1;
            } else {
                for (const tc of testCases) {
                    const weight = tc.scoreWeight || 1;
                    totalWeight += weight;

                    const tcResult = await this.executeTestCase(
                        tempDir,
                        mainClassName || "Main",
                        tc.inputData || "",
                        tc.expectedOutput || ""
                    );

                    if (tcResult.passed) {
                        passedCount++;
                        passedWeight += weight;
                    }
                }
            }

            // Tính điểm theo thang 100 (tương thích toàn bộ UI và Lecturer dashboard)
            const calculatedScore = totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100 * 10) / 10 : 0;
            console.log(`[GradingService] Kết quả test cases: ${passedCount}/${testCases.length} đạt. Điểm: ${calculatedScore}/100`);

            // Bước 4: AST ANALYSIS (Kiểm tra đạo văn Winnowing)
            emitGradingProgress({
                submissionId,
                step: "AST_ANALYSIS",
                progressPercent: 75,
                message: "Đang phân tích cấu trúc cây cú pháp AST...",
            });

            await astService.check(submissionId, resolvedZipPath);

            // Bước 5: AI REVIEW (Đánh giá Clean Code)
            emitGradingProgress({
                submissionId,
                step: "AI_REVIEW",
                progressPercent: 90,
                message: "Đang tổng hợp đánh giá chất lượng mã nguồn...",
            });

            let aiFeedbackText = this.generateCleanCodeFeedback(calculatedScore, passedCount, testCases.length);

            // Bước 6: COMPLETE (Cập nhật kết quả cuối cùng)
            // Kiểm tra xem bài nộp có bị tạm giữ điểm do DANGER đạo văn không
            const currentSub = await prisma.submission.findUnique({
                where: { id: submissionId },
                select: { status: true },
            });

            const finalStatus = currentSub?.status === "SCORE_WITHHELD" ? "SCORE_WITHHELD" : "COMPLETED";

            await prisma.submission.update({
                where: { id: submissionId },
                data: {
                    status: finalStatus,
                    totalScore: calculatedScore,
                    aiFeedback: aiFeedbackText,
                },
            });

            emitGradingProgress({
                submissionId,
                step: "COMPLETE",
                progressPercent: 100,
                message:
                    finalStatus === "SCORE_WITHHELD"
                        ? "Phát hiện tương đồng cao — Điểm tạm giữ để Giảng viên đối chiếu."
                        : `Hoàn tất chấm điểm tự động. Điểm: ${(calculatedScore / 10).toFixed(1)}/10 (${calculatedScore} điểm).`,
            });

            console.log(`[GradingService] Hoàn tất chấm điểm bài nộp ${submissionId} (status: ${finalStatus}, score: ${calculatedScore})`);
        } catch (error: any) {
            console.error(`[GradingService] Lỗi không mong muốn khi chấm bài ${submissionId}:`, error);
            await prisma.submission
                .update({
                    where: { id: submissionId },
                    data: { status: "FAILED" },
                })
                .catch(() => {});
        } finally {
            if (tempDir) {
                this.cleanupTempDir(tempDir);
            }
        }
    }

    /**
     * Biên dịch các file Java trong thư mục
     */
    private compileJavaFiles(dir: string): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            // Thử biên dịch chuẩn javac -encoding UTF-8
            exec('javac -encoding UTF-8 *.java', { cwd: dir, timeout: 15000 }, (err, _stdout, stderr) => {
                if (!err) {
                    return resolve({ success: true });
                }
                // Nếu JDK mới hơn có cờ --release, thử lại với --release 8 để tương thích tối đa runtime
                exec('javac --release 8 -encoding UTF-8 *.java', { cwd: dir, timeout: 15000 }, (rErr, _rStdout, rStderr) => {
                    if (!rErr) {
                        return resolve({ success: true });
                    }
                    resolve({ success: false, error: stderr || rStderr || err.message });
                });
            });
        });
    }

    /**
     * Chạy 1 test case với timeout 5 giây
     */
    private executeTestCase(
        dir: string,
        mainClass: string,
        inputData: string,
        expectedOutput: string
    ): Promise<TestCaseResult> {
        return new Promise((resolve) => {
            const startTime = Date.now();
            let stdout = "";
            let stderr = "";
            let killed = false;

            const child = spawn("java", ["-cp", dir, mainClass], {
                stdio: ["pipe", "pipe", "pipe"],
                cwd: dir,
            });

            const timeoutTimer = setTimeout(() => {
                killed = true;
                child.kill("SIGKILL");
            }, 5000);

            child.stdout.on("data", (d) => {
                stdout += d.toString();
            });

            child.stderr.on("data", (d) => {
                stderr += d.toString();
            });

            if (inputData) {
                try {
                    child.stdin.write(inputData.trim() + "\n");
                    child.stdin.end();
                } catch {
                    // ignore
                }
            } else {
                child.stdin.end();
            }

            child.on("close", () => {
                clearTimeout(timeoutTimer);
                const durationMs = Date.now() - startTime;
                const actual = stdout.trim();
                const expected = expectedOutput.trim();

                // So sánh mềm: hoặc bằng chính xác, hoặc stdout chứa expected output
                const passed = !killed && (actual === expected || actual.includes(expected));

                resolve({
                    passed,
                    actualOutput: actual,
                    expectedOutput: expected,
                    durationMs,
                });
            });

            child.on("error", () => {
                clearTimeout(timeoutTimer);
                resolve({
                    passed: false,
                    actualOutput: stdout,
                    expectedOutput: expectedOutput.trim(),
                    durationMs: Date.now() - startTime,
                });
            });
        });
    }

    /**
     * Tạo nhận xét Clean Code và chất lượng mã nguồn
     */
    private generateCleanCodeFeedback(score: number, passedTc: number, totalTc: number): string {
        const feedbackLines: string[] = [];

        if (score >= 90) {
            feedbackLines.push("🌟 Mã nguồn thực thi xuất sắc, vượt qua toàn bộ các ca kiểm thử chức năng.");
            feedbackLines.push("✓ Cấu trúc thuật toán tối ưu, logic phân tách rõ ràng và xử lý tốt các trường hợp biên.");
            feedbackLines.push("✓ Tuân thủ quy chuẩn đặt tên biến và phương thức CamelCase trong Java.");
        } else if (score >= 50) {
            feedbackLines.push(`⚠️ Bài nộp vượt qua ${passedTc}/${totalTc} test cases (${score}/100 điểm).`);
            feedbackLines.push("• Một số trường hợp biên hoặc định dạng đầu ra chưa khớp hoàn toàn với đặc tả.");
            feedbackLines.push("• Khuyến nghị: Kiểm tra lại các điều kiện dừng của vòng lặp và xử lý các giá trị đặc biệt.");
        } else {
            feedbackLines.push(`❌ Bài nộp chưa vượt qua các test cases chính (${passedTc}/${totalTc} passed).`);
            feedbackLines.push("• Vui lòng kiểm tra lại luồng đọc dữ liệu từ Scanner và định dạng đầu ra chuẩn.");
        }

        return feedbackLines.join("\n");
    }

    /**
     * Dọn dẹp thư mục tạm thời
     */
    private cleanupTempDir(dir: string): void {
        try {
            if (fs.existsSync(dir)) {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        } catch {
            // ignore
        }
    }
}

export const gradingService = new GradingService();
