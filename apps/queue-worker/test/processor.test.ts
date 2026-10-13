import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type {
  SubmissionJobPayload,
} from "../src/contracts/job.contract.js";

// ─── Mock config ─────────────────────────────────────────────────────────────
vi.mock("../src/config.js", () => ({
  config: {
    USE_MOCKS: true,
    REDIS_HOST: "localhost",
    REDIS_PORT: 6379,
    REDIS_PASSWORD: "",
    REDIS_DB: 0,
    WORKER_CONCURRENCY: 5,
    BATCH_CONCURRENCY: 2,
    API_GATEWAY_URL: "http://localhost:5000",
    INTERNAL_API_KEY: "test-key",
    SANDBOX_URL: "http://localhost:5001",
    SANDBOX_TIMEOUT_MS: 30000,
    AST_ENGINE_URL: "http://localhost:8001",
    AST_TIMEOUT_MS: 15000,
    GENAI_GATEWAY_URL: "http://localhost:5002",
    GENAI_TIMEOUT_MS: 30000,
    AI_REVIEW_RETRY_DELAY_MS: 30000,
    AI_REVIEW_MAX_RETRY_ROUNDS: 3,
    PIPELINE_TIMEOUT_MS: 90000,
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
    GIT_HOST_ALLOWLIST: ["github.com"],
    GIT_WORKER_CONCURRENCY: 2,
    GIT_CLONE_TIMEOUT_MS: 60000,
    MAX_REPO_SIZE_MB: 100,
    MAX_COMMITS: 5000,
    FREE_RIDER_THRESHOLD_PERCENT: 5,
    CONTRIBUTION_COMMIT_WEIGHT: 0.5,
    CONTRIBUTION_LOC_WEIGHT: 0.5,
    GIT_TEMP_DIR: "./tmp/git",
  },
}));

// Mock logger
vi.mock("../src/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

// Mock aiReviewRetryQueue
vi.mock("../src/queue/submission.queue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/queue/submission.queue.js")>();
  return {
    ...actual,
    aiReviewRetryQueue: {
      add: vi.fn().mockResolvedValue({ id: "ai-retry-job-123" }),
    },
  };
});

const { processSubmission, clients } = await import("../src/worker/processor.js");
const { aiReviewRetryQueue } = await import("../src/queue/submission.queue.js");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockJob(
  overrides: Partial<SubmissionJobPayload> = {},
): Job<SubmissionJobPayload> {
  const defaultPayload: SubmissionJobPayload = {
    submissionId: "test-sub-001",
    assignmentId: "test-assign-001",
    studentId: "test-student-001",
    language: "java",
    fileRelativePath: "uploads/submissions/test_happy_path.zip",
    submittedAt: new Date().toISOString(),
    reason: "INITIAL",
    gradingRunNo: 1,
    ...overrides,
  };

  const job = {
    id: defaultPayload.submissionId,
    data: defaultPayload,
    attemptsMade: 0,
    opts: { attempts: 4 },
    updateData: vi.fn().mockImplementation(async (newData) => {
      job.data = newData;
    }),
  } as unknown as Job<SubmissionJobPayload>;

  return job;
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe("processSubmission (End-to-End Orchestrator)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Happy Path ────────────────────────────────────────────────────────
  it("should grade happy path through Sandbox -> AST -> GenAI with 10/10 score", async () => {
    const job = createMockJob();
    const result = await processSubmission(job);

    expect(result.finalStatus).toBe("GRADED");
    expect(result.totalScore).toBe(10);
    expect(result.sandbox.outcome).toBe("PASSED");
    expect(result.plagiarism.status).toBe("CLEAN");
    expect(result.genai).toBeDefined();
    expect(result.genai?.cleanCodeScore).toBe(88);
    expect(result.genai?.aiReviewPending).toBe(false);
    expect(result.completedAt).toBeTruthy();

    // Verify checkpoint was updated
    expect(job.updateData).toHaveBeenCalled();
  });

  // ── Sandbox TIMEOUT ──────────────────────────────────────────────────
  it("should handle TIMEOUT — complete immediately, skip AST & GenAI", async () => {
    const job = createMockJob({
      submissionId: "test-timeout-001",
      fileRelativePath: "uploads/submissions/timeout_case.zip",
    });

    const result = await processSubmission(job);

    expect(result.finalStatus).toBe("TIMEOUT");
    expect(result.totalScore).toBe(0);
    expect(result.sandbox.outcome).toBe("TIMEOUT");
    expect(result.plagiarism.status).toBe("SKIPPED");
  });

  // ── SECURITY_VIOLATION ───────────────────────────────────────────────
  it("should handle SECURITY_VIOLATION — complete immediately, skip AST & GenAI", async () => {
    const job = createMockJob({
      submissionId: "test-security-001",
      fileRelativePath: "uploads/submissions/security_violation_test.zip",
    });

    const result = await processSubmission(job);

    expect(result.finalStatus).toBe("SECURITY_VIOLATION");
    expect(result.totalScore).toBe(0);
    expect(result.sandbox.outcome).toBe("SECURITY_VIOLATION");
    expect(result.plagiarism.status).toBe("SKIPPED");
  });

  // ── COMPILATION_ERROR + GenAI explanation ─────────────────────────────
  it("should handle COMPILATION_ERROR — skip AST, call GenAI for explanation", async () => {
    const job = createMockJob({
      submissionId: "test-compile-001",
      fileRelativePath: "uploads/submissions/compilation_error_test.zip",
    });

    const result = await processSubmission(job);

    expect(result.finalStatus).toBe("COMPILATION_ERROR");
    expect(result.totalScore).toBe(0);
    expect(result.plagiarism.status).toBe("SKIPPED");
    expect(result.genai?.compilationExplanation).toContain("Lỗi biên dịch");
  });

  // ── AST Failure is Non-blocking ───────────────────────────────────────
  it("should continue to GenAI even if AST analysis fails", async () => {
    const job = createMockJob({
      submissionId: "test-ast-fail-001",
      fileRelativePath: "uploads/submissions/ast_error_case.zip",
    });

    const result = await processSubmission(job);

    expect(result.finalStatus).toBe("GRADED");
    expect(result.plagiarism.status).toBe("SKIPPED");
    expect(result.genai?.cleanCodeScore).toBe(88);
  });

  // ── Plagiarism Flagged (>60%) ─────────────────────────────────────────
  it("should flag plagiarism when similarity > 60%", async () => {
    const job = createMockJob({
      submissionId: "test-plagiarism-001",
      fileRelativePath: "uploads/submissions/plagiarism_detected.zip",
    });

    const result = await processSubmission(job);

    expect(result.finalStatus).toBe("GRADED");
    expect(result.plagiarism.status).toBe("SUSPICIOUS");
    expect(result.plagiarism.similarityPercent).toBe(75);
  });

  // ── GenAI Outage -> AI_REVIEW_PENDING ─────────────────────────────────
  it("should enter AI_REVIEW_PENDING on GenAI outage and schedule delayed retry", async () => {
    const job = createMockJob({
      submissionId: "test-genai-outage-001",
      fileRelativePath: "uploads/submissions/genai_outage_sample.zip",
    });

    const result = await processSubmission(job);

    expect(result.finalStatus).toBe("AI_REVIEW_PENDING");
    expect(result.genai?.aiReviewPending).toBe(true);
    expect(result.totalScore).toBe(10);
    expect(aiReviewRetryQueue.add).toHaveBeenCalledWith(
      "ai-review-retry",
      expect.anything(),
      expect.objectContaining({ delay: 30000 }),
    );
  });

  // ── Checkpoint Resume ────────────────────────────────────────────────
  it("should skip Sandbox execution on retry if checkpoint has sandbox result", async () => {
    const initialSandboxOutcome = {
      outcome: "PASSED" as const,
      passedTests: 8,
      totalTests: 10,
      executionTimeMs: 900,
    };

    const sandboxExecuteSpy = vi.spyOn(clients.sandbox, "execute");

    const job = createMockJob({
      submissionId: "test-checkpoint-resume",
      checkpoint: {
        sandbox: initialSandboxOutcome,
      },
    });

    const result = await processSubmission(job);

    // Sandbox execute should NOT have been called because it resumed from checkpoint!
    expect(sandboxExecuteSpy).not.toHaveBeenCalled();
    expect(result.totalScore).toBe(8);
    expect(result.sandbox.passedTests).toBe(8);
  });

  // ── Re-grade & Batch Support ──────────────────────────────────────────
  it("should handle REGRADE jobs preserving reason and gradingRunNo", async () => {
    const job = createMockJob({
      submissionId: "test-regrade-001",
      reason: "REGRADE",
      gradingRunNo: 2,
    });

    const result = await processSubmission(job);

    expect(result.reason).toBe("REGRADE");
    expect(result.gradingRunNo).toBe(2);
    expect(result.finalStatus).toBe("GRADED");
  });

  // ── Invalid Payload ──────────────────────────────────────────────────
  it("should reject invalid job payload with ValidationError", async () => {
    const job = createMockJob({
      submissionId: "", // Empty string is invalid
    });

    await expect(processSubmission(job)).rejects.toThrow("Invalid job payload");
  });

  // ── AST Syntax Error & Checkpoint Resume with GenAI ───────────────────
  it("should handle AST syntax error by marking SKIPPED and resume with full checkpoint", async () => {
    const astSpy = vi.spyOn(clients.ast, "analyze").mockResolvedValueOnce({
      similarityPercent: 0,
      message: "Syntax error",
      syntaxError: true,
    });

    const job1 = createMockJob({
      submissionId: "test-ast-syntax-err",
    });

    const result1 = await processSubmission(job1);
    expect(result1.plagiarism.status).toBe("SKIPPED");
    expect(result1.plagiarism.message).toContain("syntax errors");
    astSpy.mockRestore();

    // Checkpoint with existing AST and GenAI
    const job2 = createMockJob({
      submissionId: "test-all-checkpoint",
      checkpoint: {
        sandbox: { outcome: "PASSED", passedTests: 0, totalTests: 0, executionTimeMs: 100 },
        ast: { similarityPercent: 10, message: "Clean", syntaxError: false },
        genai: { cleanCodeScore: 95, feedback: "Great" },
      },
    });

    const result2 = await processSubmission(job2);
    expect(result2.totalScore).toBe(0); // 0 total tests => 0 score
    expect(result2.genai?.cleanCodeScore).toBe(95);
  });

  it("should handle failure to schedule delayed retry job cleanly", async () => {
    vi.mocked(aiReviewRetryQueue.add).mockRejectedValueOnce(new Error("Redis queue down"));

    const job = createMockJob({
      submissionId: "test-genai-fail-retry-fail",
      fileRelativePath: "uploads/submissions/genai_outage_sample.zip",
    });

    const result = await processSubmission(job);
    expect(result.finalStatus).toBe("AI_REVIEW_PENDING");
  });

  it("should handle checkpoint AST skipped and suspicious branches", async () => {
    const jobSkipped = createMockJob({
      submissionId: "test-chk-ast-skipped",
      checkpoint: {
        sandbox: { outcome: "PASSED", passedTests: 10, totalTests: 10, executionTimeMs: 100 },
        ast: { skipped: true, reason: "Pre-skipped" },
        genai: { cleanCodeScore: 90, feedback: "Good" },
      },
    });

    const res1 = await processSubmission(jobSkipped);
    expect(res1.plagiarism.status).toBe("SKIPPED");
    expect(res1.plagiarism.message).toBe("Pre-skipped");

    const jobSuspicious = createMockJob({
      submissionId: "test-chk-ast-suspicious",
      checkpoint: {
        sandbox: { outcome: "PASSED", passedTests: 10, totalTests: 10, executionTimeMs: 100 },
        ast: { similarityPercent: 88, message: "Suspicious match", syntaxError: false },
        genai: { cleanCodeScore: 90, feedback: "Good" },
      },
    });

    const res2 = await processSubmission(jobSuspicious);
    expect(res2.plagiarism.status).toBe("SUSPICIOUS");
  });
});
