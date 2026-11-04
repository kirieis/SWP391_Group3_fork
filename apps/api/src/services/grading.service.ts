import fs from "fs";
import path from "path";
import { exec, spawn } from "child_process";
import AdmZip from "adm-zip";
import { prisma } from "../prisma.js";
import { emitGradingProgress } from "../socket/index.js";
import { astService } from "./ast.service.js";
import { aiGateway, buildCleanCodeReviewPrompt } from "./genai/index.js";

interface TestCaseResult {
    testCaseId?: string;
    passed: boolean;
    actualOutput: string;
    expectedOutput: string;
    durationMs: number;
    inputData?: string;
    scoreWeight?: number;
    isHidden?: boolean;
    status?: "PASSED" | "FAILED";
    errorType?: "TIMEOUT" | "RUNTIME_ERROR" | "WRONG_ANSWER" | "EXECUTION_ERROR";
    error?: string;
}

export class GradingService {
    /**
     * Runs the complete grading pipeline for a single submission:
     * 1. Queued
     * 2. Building (unzip, normalize Java files, javac compile)
     * 3. Running Tests (execute test cases via java CLI)
     * 4. AST Analysis (Winnowing plagiarism detection)
     * 5. AI Review (source code quality evaluation)
     * 6. Complete (update DB and emit socket events)
     */
    public async gradeSubmission(submissionId: string, zipFilePath: string): Promise<void> {
        let tempDir = "";
        try {
            console.log(`[GradingService] Starting grading for submission ${submissionId}`);

            // Fetch submission details and assignment with test cases
            const submission = await prisma.submission.findUnique({
                where: { id: submissionId },
                include: {
                    assignment: {
                        include: { testCases: true },
                    },
                },
            });

            if (!submission) {
                console.error(`[GradingService] Submission ${submissionId} not found`);
                return;
            }

            // Step 1: QUEUED
            emitGradingProgress({
                submissionId,
                step: "QUEUED",
                progressPercent: 10,
                message: "Submission received and queued for grading.",
            });

            // Check ZIP file on disk
            let resolvedZipPath = zipFilePath;
            if (!path.isAbsolute(resolvedZipPath)) {
                resolvedZipPath = path.resolve(process.cwd(), resolvedZipPath);
            }
            if (!fs.existsSync(resolvedZipPath)) {
                const altPath = path.resolve(process.cwd(), "uploads", "submissions", path.basename(zipFilePath));
                if (fs.existsSync(altPath)) {
                    resolvedZipPath = altPath;
                } else {
                    console.error(`[GradingService] ZIP file not found at: ${resolvedZipPath}`);
                    await prisma.submission.update({
                        where: { id: submissionId },
                        data: { status: "FAILED" },
                    });
                    return;
                }
            }

            // Step 2: BUILDING (Prepare and compile)
            emitGradingProgress({
                submissionId,
                step: "BUILDING",
                progressPercent: 25,
                message: "Extracting and compiling Java source code...",
            });

            tempDir = path.join(process.cwd(), "uploads", "temp", `sub_${submissionId}_${Date.now()}`);
            fs.mkdirSync(tempDir, { recursive: true });

            // Safely extract ZIP archive
            const zip = new AdmZip(resolvedZipPath);
            zip.extractAllTo(tempDir, true);

            // Find and normalize .java files
            const javaFiles = fs.readdirSync(tempDir).filter((f) => f.toLowerCase().endsWith(".java"));
            if (javaFiles.length === 0) {
                console.warn(`[GradingService] No .java files found in ${resolvedZipPath}`);
                await prisma.submission.update({
                    where: { id: submissionId },
                    data: {
                        status: "COMPILATION_ERROR",
                        automaticScore: 0,
                    },
                });
                await prisma.submission.updateMany({ where: { id: submissionId, manualScore: null }, data: { totalScore: 0 } });
                emitGradingProgress({
                    submissionId,
                    step: "COMPLETE",
                    progressPercent: 100,
                    message: "Compilation error: No .java source files found in the uploaded archive.",
                });
                await astService.check(submissionId, resolvedZipPath).catch(() => { });
                this.cleanupTempDir(tempDir);
                return;
            }

            let mainClassName: string | null = null;
            for (const file of javaFiles) {
                const filePath = path.join(tempDir, file);
                const content = fs.readFileSync(filePath, "utf-8");

                // If file has a public class whose name doesn't match filename -> rename file to avoid javac error
                const publicClassMatch = content.match(/public\s+class\s+([A-Za-z0-9_]+)/);
                if (publicClassMatch) {
                    const className = publicClassMatch[1];
                    if (file !== `${className}.java`) {
                        const newFilePath = path.join(tempDir, `${className}.java`);
                        fs.renameSync(filePath, newFilePath);
                        console.log(`[GradingService] Renamed file ${file} -> ${className}.java`);
                    }
                    if (content.includes("public static void main")) {
                        mainClassName = className;
                    }
                } else if (content.includes("public static void main")) {
                    mainClassName = path.basename(file, ".java");
                }
            }

            // If mainClassName still not found, pick the first class
            if (!mainClassName) {
                const currentFiles = fs.readdirSync(tempDir).filter((f) => f.toLowerCase().endsWith(".java"));
                if (currentFiles.length > 0) {
                    mainClassName = path.basename(currentFiles[0], ".java");
                }
            }

            // Biên dịch bằng javac
            const compileSuccess = await this.compileJavaFiles(tempDir);
            if (!compileSuccess.success) {
                console.warn(`[GradingService] Compilation error: ${compileSuccess.error}`);
                await prisma.submission.update({
                    where: { id: submissionId },
                    data: {
                        status: "COMPILATION_ERROR",
                        automaticScore: 0,
                    },
                });
                await prisma.submission.updateMany({ where: { id: submissionId, manualScore: null }, data: { totalScore: 0 } });
                emitGradingProgress({
                    submissionId,
                    step: "COMPLETE",
                    progressPercent: 100,
                    message: `Compilation error: ${compileSuccess.error?.slice(0, 200)}`,
                });
                await astService.check(submissionId, resolvedZipPath).catch(() => { });
                this.cleanupTempDir(tempDir);
                return;
            }

            // Step 3: RUNNING_TESTS (Execute Test Cases)
            emitGradingProgress({
                submissionId,
                step: "RUNNING_TESTS",
                progressPercent: 50,
                message: "Running test cases against the submitted solution...",
            });

            await prisma.submission.update({
                where: { id: submissionId },
                data: { status: "RUNNING_TESTS" },
            });

            const testCases = submission.assignment?.testCases || [];
            let totalWeight = 0;
            let passedWeight = 0;
            let passedCount = 0;
            const testResults: Array<TestCaseResult & { testCaseId?: string; error?: string }> = [];

            // Never award points when an assignment has no configured test cases.
            // A source archive compiling successfully is not equivalent to passing tests.
            for (const tc of testCases) {
                const weight = Math.max(0, Number(tc.scoreWeight) || 1);
                totalWeight += weight;

                const tcResult = await this.executeTestCase(
                    tempDir,
                    mainClassName || "Main",
                    tc.inputData || "",
                    tc.expectedOutput || ""
                );

                testResults.push({
                    testCaseId: tc.id,
                    passed: tcResult.passed,
                    status: tcResult.passed ? "PASSED" : "FAILED",
                    actualOutput: tcResult.actualOutput,
                    expectedOutput: tcResult.expectedOutput,
                    inputData: tc.inputData || "",
                    scoreWeight: weight,
                    isHidden: Boolean((tc as any).isHidden),
                    durationMs: tcResult.durationMs,
                    ...(tcResult.errorType ? { errorType: tcResult.errorType } : {}),
                    ...(!tcResult.passed && tcResult.error ? { error: tcResult.error } : {}),
                });

                if (tcResult.passed) {
                    passedCount++;
                    passedWeight += weight;
                }
            }

            // Score is based only on configured test cases; zero test cases means zero, not 10/10.
            const calculatedScore = totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 10 * 10) / 10 : 0; // Scale 0-10

            console.log(`[GradingService] Test results: ${passedCount}/${testCases.length} passed. Score: ${calculatedScore}/10`);

            // Step 4: AST ANALYSIS (Winnowing plagiarism check)
            emitGradingProgress({
                submissionId,
                step: "AST_ANALYSIS",
                progressPercent: 75,
                message: "Analyzing AST structure for plagiarism detection...",
            });

            await astService.check(submissionId, resolvedZipPath);

            // Step 5: AI REVIEW (Clean Code Evaluation)
            emitGradingProgress({
                submissionId,
                step: "AI_REVIEW",
                progressPercent: 90,
                message: "Generating AI feedback on source code quality...",
            });

            const sourceCode = this.collectSourceCode(tempDir);
            let aiFeedbackText: string;

            if (!sourceCode.trim()) {
                aiFeedbackText = JSON.stringify({
                    status: "UNAVAILABLE",
                    message: "No supported source-code files were found in the uploaded ZIP archive.",
                });
            } else {
                try {
                    const language = submission.assignment?.language || "Java";
                    const reviewPrompt = buildCleanCodeReviewPrompt(sourceCode, language);
                    const aiReview = await aiGateway.chat({
                        systemPrompt: reviewPrompt.systemPrompt,
                        userPrompt: reviewPrompt.userPrompt,
                        temperature: reviewPrompt.temperature ?? 0.15,
                        maxTokens: reviewPrompt.maxTokens,
                        jsonMode: reviewPrompt.jsonMode,
                    });

                    if (aiReview.status === "COMPLETED" && aiReview.data?.content?.trim()) {
                        aiFeedbackText = this.normalizeAiReview(aiReview.data.content);
                    } else {
                        console.warn(`[GradingService] AI review unavailable for ${submissionId}: ${aiReview.error || "No AI response"}`);
                        aiFeedbackText = JSON.stringify({
                            status: "UNAVAILABLE",
                            message: "AI code review is temporarily unavailable. Your automatic test results are not affected.",
                        });
                    }
                } catch (aiError) {
                    console.error(`[GradingService] AI review failed for ${submissionId}:`, aiError);
                    aiFeedbackText = JSON.stringify({
                        status: "UNAVAILABLE",
                        message: "AI code review could not be completed. Your automatic test results are not affected.",
                    });
                }
            }

            // Step 6: COMPLETE (Finalize results)
            // Check if the submission's score was withheld due to DANGER-level plagiarism
            const currentSub = await prisma.submission.findUnique({
                where: { id: submissionId },
                select: { status: true },
            });

            const finalStatus = currentSub?.status === "SCORE_WITHHELD" ? "SCORE_WITHHELD" : "COMPLETED";

            await prisma.submission.update({
                where: { id: submissionId },
                data: {
                    status: finalStatus,
                    automaticScore: calculatedScore,
                    aiFeedback: aiFeedbackText,
                    testResults: JSON.stringify(testResults),
                } as any,
            });
            // Preserve lecturer overrides even if the automatic pipeline finishes later.
            await prisma.submission.updateMany({
                where: { id: submissionId, manualScore: null },
                data: { totalScore: calculatedScore },
            });

            emitGradingProgress({
                submissionId,
                step: "COMPLETE",
                progressPercent: 100,
                message:
                    finalStatus === "SCORE_WITHHELD"
                        ? "High similarity detected — Score withheld pending lecturer review."
                        : `Grading complete. Score: ${(calculatedScore / 10).toFixed(1)}/10 (${calculatedScore} pts).`,
            });

            console.log(`[GradingService] Grading finished for submission ${submissionId} (status: ${finalStatus}, score: ${calculatedScore})`);
        } catch (error: any) {
            console.error(`[GradingService] Unexpected error while grading submission ${submissionId}:`, error);
            await prisma.submission
                .update({
                    where: { id: submissionId },
                    data: { status: "FAILED" },
                })
                .catch(() => { });
        } finally {
            if (tempDir) {
                this.cleanupTempDir(tempDir);
            }
        }
    }

    /**
     * Compiles all Java files in the given directory
     */
    private compileJavaFiles(dir: string): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            // Try standard compilation: javac -encoding UTF-8
            exec('javac -encoding UTF-8 *.java', { cwd: dir, timeout: 15000 }, (err, _stdout, stderr) => {
                if (!err) {
                    return resolve({ success: true });
                }
                // If newer JDK supports --release flag, retry with --release 8 for maximum runtime compatibility
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
     * Runs a single test case with a 5-second timeout
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

                // Normalize line endings (CRLF -> LF) and trailing whitespace per line
                const normalize = (s: string) =>
                    s
                        .replace(/\r\n/g, "\n")
                        .replace(/\r/g, "\n")
                        .split("\n")
                        .map((l) => l.trimEnd())
                        .join("\n")
                        .trim();

                const actual = normalize(stdout);
                const expected = normalize(expectedOutput);

                // 1. Exact match after normalization
                let passed = !killed && child.exitCode === 0 && actual === expected;

                // 2. Token-level comparison (if words/numbers are identical but spacing/newlines differ)
                if (!passed && !killed && child.exitCode === 0 && expected.length > 0) {
                    const actualTokens = actual.split(/\s+/).filter(Boolean);
                    const expectedTokens = expected.split(/\s+/).filter(Boolean);
                    if (actualTokens.length === expectedTokens.length && actualTokens.length > 0) {
                        passed = actualTokens.every((tok, idx) => tok === expectedTokens[idx]);
                    }
                }

                let errorMsg: string | undefined = undefined;
                let errorType: TestCaseResult["errorType"];
                if (!passed) {
                    if (killed) {
                        errorType = "TIMEOUT";
                        errorMsg = "Execution timed out after 5 seconds.";
                    } else if (child.exitCode !== 0) {
                        errorType = "RUNTIME_ERROR";
                        errorMsg = stderr.trim() || `Process terminated with error code ${child.exitCode}.`;
                    } else if (stderr.trim()) {
                        errorType = "EXECUTION_ERROR";
                        errorMsg = stderr.trim();
                    } else {
                        errorType = "WRONG_ANSWER";
                        errorMsg = "Output mismatch: expected output did not match actual output.";
                    }
                }

                resolve({
                    passed,
                    actualOutput: actual,
                    expectedOutput: expected,
                    durationMs,
                    ...(errorType ? { errorType } : {}),
                    ...(errorMsg ? { error: errorMsg } : {}),
                });
            });

            child.on("error", () => {
                clearTimeout(timeoutTimer);
                resolve({
                    passed: false,
                    actualOutput: stdout,
                    expectedOutput: expectedOutput.trim(),
                    durationMs: Date.now() - startTime,
                    errorType: "EXECUTION_ERROR",
                    error: "Failed to start the Java process.",
                });
            });
        });
    }

    /**
     * Collect source files recursively so ZIPs containing a project folder can
     * be reviewed even when source files are not located at the archive root.
     */
    private collectSourceCode(rootDir: string): string {
        const supportedExtensions = new Set([
            ".java", ".py", ".js", ".jsx", ".ts", ".tsx", ".cs",
            ".c", ".h", ".cpp", ".hpp", ".go", ".kt", ".kts",
            ".swift", ".php", ".rb", ".rs",
        ]);
        const ignoredDirectories = new Set([
            "node_modules", ".git", "target", "build", "dist", ".gradle",
            ".idea", ".vscode", "__pycache__",
        ]);
        const collected: string[] = [];

        const visit = (directory: string): void => {
            for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
                const fullPath = path.join(directory, entry.name);
                if (entry.isDirectory()) {
                    if (!ignoredDirectories.has(entry.name)) visit(fullPath);
                    continue;
                }

                if (!entry.isFile() || !supportedExtensions.has(path.extname(entry.name).toLowerCase())) {
                    continue;
                }

                try {
                    const content = fs.readFileSync(fullPath, "utf-8");
                    if (content.trim()) {
                        const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, "/");
                        collected.push(`// File: ${relativePath}\n${content}`);
                    }
                } catch (readError) {
                    console.warn(`[GradingService] Could not read source file ${fullPath}:`, readError);
                }
            }
        };

        visit(rootDir);
        return collected.join("\n\n");
    }

    /**
     * Normalize the AI response into a predictable shape for the result page.
     * If a provider returns non-JSON text, preserve it as rawText instead.
     */
    private normalizeAiReview(content: string): string {
        const trimmed = content.trim();
        const withoutFence = trimmed
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, "")
            .trim();

        try {
            const parsedStart = withoutFence.indexOf("{");
            const parsedEnd = withoutFence.lastIndexOf("}");
            if (parsedStart < 0 || parsedEnd <= parsedStart) {
                return JSON.stringify({ status: "COMPLETED", rawText: trimmed });
            }

            const parsed = JSON.parse(withoutFence.slice(parsedStart, parsedEnd + 1));
            const categories = parsed.categories && typeof parsed.categories === "object"
                ? parsed.categories
                : {};
            const normalizeCategory = (value: unknown) => {
                const numeric = Number(value);
                return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : null;
            };
            const numericScore = Number(parsed.score);

            return JSON.stringify({
                status: "COMPLETED",
                score: Number.isFinite(numericScore)
                    ? Math.max(0, Math.min(100, Math.round(numericScore)))
                    : null,
                categories: {
                    naming: normalizeCategory(categories.naming),
                    solid: normalizeCategory(categories.solid),
                    errorHandling: normalizeCategory(categories.errorHandling),
                    architecture: normalizeCategory(categories.architecture),
                },
                comments: Array.isArray(parsed.comments)
                    ? parsed.comments.filter((item: unknown) => typeof item === "string")
                    : [],
                summary: typeof parsed.summary === "string" ? parsed.summary : "",
            });
        } catch {
            return JSON.stringify({ status: "COMPLETED", rawText: trimmed });
        }
    }

    /**
     * Cleans up the temporary working directory
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
