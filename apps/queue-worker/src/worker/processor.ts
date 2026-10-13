import type { Job } from "bullmq";
import { config } from "../config.js";
import { logger } from "../logger.js";
import {
  SubmissionJobPayloadSchema,
  type SubmissionJobPayload,
  type SubmissionJobResult,
  type JobCheckpoint,
} from "../contracts/job.contract.js";
import type { Module1CallbackBody } from "../contracts/module1.contract.js";
import type {
  ISandboxClient,
  SandboxResponse,
} from "../contracts/sandbox.contract.js";
import {
  AST_SIMILARITY_DANGER_THRESHOLD,
  type IAstClient,
  type PlagiarismStatus,
} from "../contracts/ast.contract.js";
import type {
  IGenAiClient,
  GenAiReviewResponse,
} from "../contracts/genai.contract.js";
import { Module1Client } from "../clients/module1.client.js";
import { SandboxClient } from "../clients/sandbox.client.js";
import { AstClient } from "../clients/ast.client.js";
import { GenAiClient } from "../clients/genai.client.js";
import {
  MockModule1Client,
  MockSandboxClient,
  MockAstClient,
  MockGenAiClient,
} from "../clients/mocks/index.js";
import {
  classifyError,
  ValidationError,
} from "./error-classifier.js";
import { aiReviewRetryQueue } from "../queue/submission.queue.js";

// ─── Client Factory (Mock toggle via USE_MOCKS) ─────────────────────────────

type Module1Like = {
  updateSubmissionResult: Module1Client["updateSubmissionResult"];
  updateGitAnalysisResult?: Module1Client["updateGitAnalysisResult"];
};

export function createClients(): {
  module1: Module1Like;
  sandbox: ISandboxClient;
  ast: IAstClient;
  genai: IGenAiClient;
} {
  if (config.USE_MOCKS) {
    logger.warn("🧪 Running with MOCK clients (USE_MOCKS=true)");
    return {
      module1: new MockModule1Client(),
      sandbox: new MockSandboxClient(),
      ast: new MockAstClient(),
      genai: new MockGenAiClient(),
    };
  }
  return {
    module1: new Module1Client(),
    sandbox: new SandboxClient(),
    ast: new AstClient(),
    genai: new GenAiClient(),
  };
}

export const clients = createClients();

// ─── Timeout Wrapper Helper ─────────────────────────────────────────────────

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  stepName: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timeout exceeded for step: ${stepName} (${ms}ms)`));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ─── Helper: Safe callback to Module 1 ──────────────────────────────────────

async function notifyModule1(
  submissionId: string,
  body: Module1CallbackBody,
): Promise<void> {
  try {
    await clients.module1.updateSubmissionResult(submissionId, body);
  } catch (err) {
    classifyError(err, "Module1 callback");
  }
}

// ─── Helper: Map sandbox outcome to submission status ───────────────────────

function mapOutcomeToStatus(
  outcome: string,
): "COMPILATION_ERROR" | "TIMEOUT" | "SECURITY_VIOLATION" {
  switch (outcome) {
    case "TIMEOUT":
      return "TIMEOUT";
    case "SECURITY_VIOLATION":
      return "SECURITY_VIOLATION";
    default:
      return "COMPILATION_ERROR";
  }
}

// ─── Main Processor Function ────────────────────────────────────────────────

/**
 * End-to-end grading pipeline with checkpointing, error handling & GenAI.
 *
 * Sequence:
 * 1. Validate payload (Zod)
 * 2. Checkpoint check: Sandbox (skip if already completed on previous attempt)
 * 3. Stop rules: TIMEOUT / SECURITY_VIOLATION -> complete immediately.
 * 4. Stop rule: COMPILATION_ERROR -> call GenAI ONLY for explanation, skip AST, complete.
 * 5. Checkpoint check: AST (skip if completed). AST failure is non-blocking.
 * 6. Checkpoint check: GenAI (skip if completed).
 *    - On GenAI failure: do NOT fail job! Report AI_REVIEW_PENDING + schedule delayed retry.
 * 7. Compute final score, notify Module 1 -> GRADED (100%).
 */
export async function processSubmission(
  job: Job<SubmissionJobPayload>,
): Promise<SubmissionJobResult> {
  const startTime = Date.now();
  const jobLog = logger.child({
    jobId: job.id,
    submissionId: job.data.submissionId,
    attemptsMade: job.attemptsMade,
    reason: job.data.reason,
    gradingRunNo: job.data.gradingRunNo,
  });

  // ── Step 1: Validate payload ──────────────────────────────────────────
  const parseResult = SubmissionJobPayloadSchema.safeParse(job.data);
  if (!parseResult.success) {
    const errorMsg = `Invalid job payload: ${parseResult.error.message}`;
    jobLog.error({ validationErrors: parseResult.error.flatten() }, errorMsg);
    throw new ValidationError(errorMsg);
  }

  const payload = parseResult.data;
  const checkpoint: JobCheckpoint = payload.checkpoint ?? {};

  jobLog.info("Processing submission — pipeline started");

  // Helper to persist checkpoint into BullMQ job data
  const saveCheckpoint = async (updated: Partial<JobCheckpoint>) => {
    Object.assign(checkpoint, updated);
    if (job.updateData) {
      await job.updateData({
        ...job.data,
        checkpoint,
      });
    }
  };

  // ── Step 2: Sandbox Execution (Module 2) ───────────────────────────────
  let sandboxResult: SandboxResponse;

  if (checkpoint.sandbox) {
    jobLog.info("Checkpoint hit: Skipping Sandbox execution (resuming from checkpoint)");
    sandboxResult = checkpoint.sandbox;
  } else {
    await notifyModule1(payload.submissionId, {
      status: "RUNNING_TESTS",
      step: "RUNNING_TESTS",
      progressPercent: 25,
      message: "Sandbox is compiling and executing test cases...",
    });

    try {
      sandboxResult = await withTimeout(
        clients.sandbox.execute({
          submissionId: payload.submissionId,
          assignmentId: payload.assignmentId,
          language: payload.language,
          fileRelativePath: payload.fileRelativePath,
        }),
        config.SANDBOX_TIMEOUT_MS,
        "Sandbox execution",
      );

      await saveCheckpoint({ sandbox: sandboxResult });
    } catch (err) {
      classifyError(err, "Sandbox execution");
      throw err;
    }
  }

  jobLog.info(
    {
      outcome: sandboxResult.outcome,
      passedTests: sandboxResult.passedTests,
      totalTests: sandboxResult.totalTests,
      executionTimeMs: sandboxResult.executionTimeMs,
    },
    `Sandbox complete: ${sandboxResult.outcome}`,
  );

  // ── Step 3: Handle Terminal Outcomes (TIMEOUT / SECURITY_VIOLATION) ───
  if (
    sandboxResult.outcome === "TIMEOUT" ||
    sandboxResult.outcome === "SECURITY_VIOLATION"
  ) {
    const terminalStatus = mapOutcomeToStatus(sandboxResult.outcome);

    await notifyModule1(payload.submissionId, {
      status: terminalStatus,
      step: "COMPLETE",
      progressPercent: 100,
      totalScore: 0,
      message:
        `Execution terminated: ${sandboxResult.outcome}. ${sandboxResult.errorMessage ?? ""}`.trim(),
    });

    jobLog.info(
      { finalStatus: terminalStatus },
      "Job completed with terminal sandbox outcome (AST and GenAI skipped)",
    );

    return {
      submissionId: payload.submissionId,
      assignmentId: payload.assignmentId,
      studentId: payload.studentId,
      finalStatus: terminalStatus,
      totalScore: 0,
      reason: payload.reason,
      gradingRunNo: payload.gradingRunNo,
      batchId: payload.batchId,
      sandbox: {
        outcome: sandboxResult.outcome,
        passedTests: sandboxResult.passedTests,
        totalTests: sandboxResult.totalTests,
        executionTimeMs: sandboxResult.executionTimeMs,
      },
      plagiarism: {
        status: "SKIPPED",
        similarityPercent: 0,
        message: "AST analysis skipped due to terminal sandbox outcome",
      },
      completedAt: new Date().toISOString(),
    };
  }

  // ── Step 4: Handle COMPILATION_ERROR (Call GenAI for explanation only) ──
  if (sandboxResult.outcome === "COMPILATION_ERROR") {
    let compilationExplanation: string | undefined;

    try {
      const genaiExplanation = await withTimeout(
        clients.genai.review({
          submissionId: payload.submissionId,
          language: payload.language,
          fileRelativePath: payload.fileRelativePath,
          isCompilationError: true,
          compileOutput: sandboxResult.errorMessage,
        }),
        config.GENAI_TIMEOUT_MS,
        "GenAI Compilation Explanation",
      );
      compilationExplanation =
        genaiExplanation.compilationExplanation ?? genaiExplanation.feedback;
    } catch (err) {
      jobLog.warn(
        { error: err instanceof Error ? err.message : String(err) },
        "GenAI compilation explanation failed (non-fatal, proceeding)",
      );
    }

    await notifyModule1(payload.submissionId, {
      status: "COMPILATION_ERROR",
      step: "COMPLETE",
      progressPercent: 100,
      totalScore: 0,
      compileErrorExplanation: compilationExplanation,
      message:
        `Compilation error: ${sandboxResult.errorMessage ?? "Build failed"}`.trim(),
    });

    jobLog.info("Job completed with COMPILATION_ERROR (AST skipped)");

    return {
      submissionId: payload.submissionId,
      assignmentId: payload.assignmentId,
      studentId: payload.studentId,
      finalStatus: "COMPILATION_ERROR",
      totalScore: 0,
      reason: payload.reason,
      gradingRunNo: payload.gradingRunNo,
      batchId: payload.batchId,
      sandbox: {
        outcome: sandboxResult.outcome,
        passedTests: sandboxResult.passedTests,
        totalTests: sandboxResult.totalTests,
        executionTimeMs: sandboxResult.executionTimeMs,
      },
      plagiarism: {
        status: "SKIPPED",
        similarityPercent: 0,
        message: "AST skipped due to compilation error",
      },
      genai: {
        cleanCodeScore: 0,
        feedback: "Compilation error",
        compilationExplanation,
        aiReviewPending: false,
      },
      completedAt: new Date().toISOString(),
    };
  }

  // ── Step 5: AST Plagiarism Analysis (Module 4) — Non-blocking ─────────
  let plagiarismStatus: PlagiarismStatus = "SKIPPED";
  let similarityPercent = 0;
  let plagiarismMessage = "AST analysis was skipped";

  if (checkpoint.ast) {
    jobLog.info("Checkpoint hit: Skipping AST analysis (resuming from checkpoint)");
    if ("skipped" in checkpoint.ast) {
      plagiarismStatus = "SKIPPED";
      plagiarismMessage = checkpoint.ast.reason;
    } else {
      similarityPercent = checkpoint.ast.similarityPercent;
      plagiarismStatus =
        similarityPercent >= AST_SIMILARITY_DANGER_THRESHOLD
          ? "SUSPICIOUS"
          : "CLEAN";
      plagiarismMessage = checkpoint.ast.message;
    }
  } else {
    await notifyModule1(payload.submissionId, {
      status: "RUNNING_TESTS",
      step: "AST_ANALYSIS",
      progressPercent: 60,
      message: "Analyzing Abstract Syntax Tree for plagiarism...",
    });

    try {
      const astResult = await withTimeout(
        clients.ast.analyze({
          submissionId: payload.submissionId,
          assignmentId: payload.assignmentId,
          language: payload.language,
          fileRelativePath: payload.fileRelativePath,
        }),
        config.AST_TIMEOUT_MS,
        "AST analysis",
      );

      similarityPercent = astResult.similarityPercent;

      if (astResult.syntaxError) {
        plagiarismStatus = "SKIPPED";
        plagiarismMessage = "AST analysis skipped due to syntax errors";
        await saveCheckpoint({ ast: { skipped: true, reason: plagiarismMessage } });
      } else if (similarityPercent >= AST_SIMILARITY_DANGER_THRESHOLD) {
        plagiarismStatus = "SUSPICIOUS";
        plagiarismMessage = astResult.message;
        await saveCheckpoint({ ast: astResult });
        jobLog.warn(
          { similarityPercent },
          `⚠️ Plagiarism flagged: ${similarityPercent}% similarity`,
        );
      } else {
        plagiarismStatus = "CLEAN";
        plagiarismMessage = astResult.message;
        await saveCheckpoint({ ast: astResult });
      }
    } catch (err) {
      jobLog.warn(
        { error: err instanceof Error ? err.message : String(err) },
        "AST Engine call failed — marking plagiarism as SKIPPED",
      );
      plagiarismStatus = "SKIPPED";
      plagiarismMessage = "AST service unavailable — analysis skipped";
      await saveCheckpoint({ ast: { skipped: true, reason: plagiarismMessage } });
    }
  }

  // ── Step 6: GenAI Code Review (Module 3) ───────────────────────────────
  let genaiResult: GenAiReviewResponse | null = null;
  let aiReviewPending = false;

  if (checkpoint.genai) {
    jobLog.info("Checkpoint hit: Skipping GenAI review (resuming from checkpoint)");
    genaiResult = checkpoint.genai;
  } else {
    await notifyModule1(payload.submissionId, {
      status: "RUNNING_TESTS",
      step: "AI_REVIEW",
      progressPercent: 85,
      message: "GenAI is reviewing code quality and best practices...",
    });

    try {
      genaiResult = await withTimeout(
        clients.genai.review({
          submissionId: payload.submissionId,
          language: payload.language,
          fileRelativePath: payload.fileRelativePath,
          sandboxSummary: {
            outcome: sandboxResult.outcome,
            passedTests: sandboxResult.passedTests,
            totalTests: sandboxResult.totalTests,
            executionTimeMs: sandboxResult.executionTimeMs,
          },
        }),
        config.GENAI_TIMEOUT_MS,
        "GenAI Review",
      );

      await saveCheckpoint({ genai: genaiResult });
    } catch (err) {
      jobLog.warn(
        { error: err instanceof Error ? err.message : String(err) },
        "GenAI Gateway failure — entering AI_REVIEW_PENDING mode",
      );

      aiReviewPending = true;
      await saveCheckpoint({ aiReviewPending: true });

      // Schedule delayed retry job on aiReviewRetryQueue
      try {
        await aiReviewRetryQueue.add(
          "ai-review-retry",
          {
            ...payload,
            checkpoint,
          },
          {
            jobId: `ai-retry:${payload.submissionId}:${Date.now()}`,
            delay: config.AI_REVIEW_RETRY_DELAY_MS,
          },
        );
        jobLog.info("Scheduled delayed ai-review-retry job");
      } catch (scheduleErr) {
        jobLog.error(
          { error: scheduleErr instanceof Error ? scheduleErr.message : String(scheduleErr) },
          "Failed to schedule delayed AI review retry job",
        );
      }
    }
  }

  // ── Step 7: Compute final score and report completion ─────────────────
  const rawScore =
    sandboxResult.totalTests > 0
      ? (sandboxResult.passedTests / sandboxResult.totalTests) * 10
      : 0;
  const totalScore = Math.round(rawScore * 100) / 100;

  const finalStatus = aiReviewPending ? "AI_REVIEW_PENDING" : "GRADED";

  await notifyModule1(payload.submissionId, {
    status: finalStatus,
    step: "COMPLETE",
    progressPercent: 100,
    totalScore,
    aiFeedback: genaiResult?.feedback,
    aiCleanCodeScore: genaiResult?.cleanCodeScore,
    aiReviewPending,
    astSimilarityPercent: similarityPercent,
    plagiarismFlag: plagiarismStatus === "SUSPICIOUS",
    message: aiReviewPending
      ? "Grading completed with Sandbox & AST. AI Review pending retry."
      : "Grading and AI review completed successfully.",
  });

  const elapsed = Date.now() - startTime;
  jobLog.info(
    {
      finalStatus,
      totalScore,
      plagiarismStatus,
      aiReviewPending,
      cleanCodeScore: genaiResult?.cleanCodeScore,
      elapsedMs: elapsed,
    },
    `Pipeline complete: status=${finalStatus}, score=${totalScore}/10`,
  );

  return {
    submissionId: payload.submissionId,
    assignmentId: payload.assignmentId,
    studentId: payload.studentId,
    finalStatus,
    totalScore,
    reason: payload.reason,
    gradingRunNo: payload.gradingRunNo,
    batchId: payload.batchId,
    sandbox: {
      outcome: sandboxResult.outcome,
      passedTests: sandboxResult.passedTests,
      totalTests: sandboxResult.totalTests,
      executionTimeMs: sandboxResult.executionTimeMs,
    },
    plagiarism: {
      status: plagiarismStatus,
      similarityPercent,
      message: plagiarismMessage,
    },
    genai: {
      cleanCodeScore: genaiResult?.cleanCodeScore ?? 0,
      feedback: genaiResult?.feedback ?? (aiReviewPending ? "AI Review Pending" : ""),
      aiReviewPending,
    },
    completedAt: new Date().toISOString(),
  };
}
