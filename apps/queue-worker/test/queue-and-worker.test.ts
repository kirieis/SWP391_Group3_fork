import { describe, it, expect, vi, beforeEach } from "vitest";
import { AxiosError } from "axios";

// Mock ioredis before any import
vi.mock("ioredis", () => {
  const MockRedis = vi.fn().mockImplementation(() => ({
    ping: vi.fn().mockResolvedValue("PONG"),
    config: vi.fn().mockResolvedValue(["maxmemory-policy", "noeviction"]),
    quit: vi.fn().mockResolvedValue("OK"),
  }));
  return {
    Redis: MockRedis,
    default: MockRedis,
  };
});

// Mock BullMQ before any import
vi.mock("bullmq", () => {
  return {
    Queue: vi.fn().mockImplementation((queueName: string) => ({
      name: queueName,
      add: vi.fn().mockImplementation((name, data, opts) =>
        Promise.resolve({ id: opts?.jobId ?? "mock-job-id", data }),
      ),
      addBulk: vi.fn().mockImplementation((jobs: Array<{ data: unknown; opts?: { jobId?: string } }>) =>
        Promise.resolve(
          jobs.map((j, idx) => ({
            id: j.opts?.jobId ?? `bulk-job-${idx}`,
            data: j.data,
          })),
        ),
      ),
      getJobs: vi.fn().mockResolvedValue([]),
      close: vi.fn().mockResolvedValue(undefined),
    })),
    Worker: vi.fn().mockImplementation((queueName: string) => ({
      name: queueName,
      on: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    })),
    UnrecoverableError: class extends Error {
      constructor(message: string) {
        super(message);
        this.name = "UnrecoverableError";
      }
    },
  };
});

// Mock config
vi.mock("../src/config.js", () => ({
  config: {
    USE_MOCKS: true,
    REDIS_HOST: "localhost",
    REDIS_PORT: 6379,
    REDIS_PASSWORD: "",
    REDIS_DB: 0,
    REDIS_URL: "",
    WORKER_CONCURRENCY: 5,
    BATCH_CONCURRENCY: 2,
    BATCH_RATE_LIMIT_MAX: 10,
    BATCH_RATE_LIMIT_DURATION_MS: 1000,
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
    debug: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

const {
  enqueueSubmission,
  enqueueBatch,
  getBatchProgress,
  verifyRedisPolicy,
} = await import("../src/queue/submission.queue.js");
const { checkHealth } = await import("../src/index.js");
const {
  InfrastructureError,
  ValidationError,
  GenAiUnavailableError,
  classifyError,
  classifyAxiosError,
} = await import("../src/worker/error-classifier.js");

describe("Queue, Worker & Error Classifier Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Queue Enqueue Semantics ─────────────────────────────────────────────
  describe("enqueueSubmission & enqueueBatch", () => {
    it("should set jobId = submissionId for initial submissions", async () => {
      const res = await enqueueSubmission({
        submissionId: "sub-100",
        assignmentId: "assign-1",
        studentId: "stu-1",
        language: "java",
        fileRelativePath: "uploads/sub1.zip",
        submittedAt: new Date().toISOString(),
      });

      expect(res.jobId).toBe("sub-100");
    });

    it("should set jobId = `${submissionId}:${gradingRunNo}` for re-grades", async () => {
      const res = await enqueueSubmission({
        submissionId: "sub-100",
        assignmentId: "assign-1",
        studentId: "stu-1",
        language: "java",
        fileRelativePath: "uploads/sub1.zip",
        submittedAt: new Date().toISOString(),
        reason: "REGRADE",
        gradingRunNo: 2,
      });

      expect(res.jobId).toBe("sub-100:2");
    });

    it("should enqueue a batch of submissions using addBulk", async () => {
      const payloads = [
        {
          submissionId: "sub-batch-1",
          assignmentId: "assign-1",
          studentId: "stu-1",
          language: "java",
          fileRelativePath: "uploads/sub1.zip",
          submittedAt: new Date().toISOString(),
        },
        {
          submissionId: "sub-batch-2",
          assignmentId: "assign-1",
          studentId: "stu-2",
          language: "java",
          fileRelativePath: "uploads/sub2.zip",
          submittedAt: new Date().toISOString(),
        },
      ];

      const res = await enqueueBatch(payloads);
      expect(res.count).toBe(2);
      expect(res.batchId).toMatch(/^batch_/);
    });

    it("should query batch progress", async () => {
      const progress = await getBatchProgress("batch-123");
      expect(progress.batchId).toBe("batch-123");
      expect(progress.total).toBe(0);
    });
  });

  // ── 2. Redis Configuration & Health Check ──────────────────────────────────
  describe("Redis Configuration & Health Check", () => {
    it("verifyRedisPolicy should report compliance when policy is noeviction", async () => {
      const res = await verifyRedisPolicy();
      expect(res.policy).toBe("noeviction");
      expect(res.isCompliant).toBe(true);
    });

    it("checkHealth should return system health status", async () => {
      const health = await checkHealth();
      expect(health.status).toBe("ok");
      expect(health.redis).toBe(true);
      expect(health.uptimeSec).toBeGreaterThanOrEqual(0);
    });
  });

  // ── 3. Error Classification Semantics ──────────────────────────────────────
  describe("Error Classification", () => {
    it("should classify 5xx and network errors as InfrastructureError (retryable)", () => {
      const networkError = new AxiosError("ECONNREFUSED");
      expect(() => classifyAxiosError(networkError, "Sandbox")).toThrow(
        InfrastructureError,
      );

      const serverError = new AxiosError("Internal Server Error");
      serverError.response = { status: 500 } as AxiosResponse;
      expect(() => classifyAxiosError(serverError, "Sandbox")).toThrow(
        InfrastructureError,
      );
    });

    it("should classify 429 as InfrastructureError (retryable after backoff)", () => {
      const rateLimitError = new AxiosError("Too Many Requests");
      rateLimitError.response = { status: 429 } as AxiosResponse;
      expect(() => classifyAxiosError(rateLimitError, "API Gateway")).toThrow(
        InfrastructureError,
      );
    });

    it("should classify 4xx (non-429) as ValidationError (unrecoverable)", () => {
      const badRequest = new AxiosError("Bad Request");
      badRequest.response = { status: 400 } as AxiosResponse;
      expect(() => classifyAxiosError(badRequest, "Validation")).toThrow(
        ValidationError,
      );
    });

    it("classifyError should re-throw GenAiUnavailableError without wrapping", () => {
      const genaiErr = new GenAiUnavailableError("All models down");
      expect(() => classifyError(genaiErr, "GenAI")).toThrow(
        GenAiUnavailableError,
      );
    });

    it("classifyError should wrap unknown errors as InfrastructureError", () => {
      const unknownErr = new Error("Something strange happened");
      expect(() => classifyError(unknownErr, "Context")).toThrow(
        InfrastructureError,
      );
    });
  });
});
