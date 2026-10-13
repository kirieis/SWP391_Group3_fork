import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ioredis
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

// Mock BullMQ
vi.mock("bullmq", () => {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const MockWorker = vi.fn().mockImplementation((name: string, processor: unknown, opts: unknown) => {
    return {
      name,
      processor,
      opts,
      on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
        handlers[`${name}:${event}`] = handler;
      }),
      close: vi.fn().mockResolvedValue(undefined),
      emitEvent: (event: string, ...args: unknown[]) => {
        const h = handlers[`${name}:${event}`];
        if (h) h(...args);
      },
    };
  });

  const MockQueue = vi.fn().mockImplementation((name: string) => ({
    name,
    add: vi.fn().mockImplementation((jobName, data, opts) =>
      Promise.resolve({ id: opts?.jobId ?? "job-mock-id", data }),
    ),
    addBulk: vi.fn().mockImplementation((jobs: Array<{ data: unknown; opts?: { jobId?: string } }>) =>
      Promise.resolve(
        jobs.map((j, idx) => ({ id: j.opts?.jobId ?? `bulk-${idx}`, data: j.data })),
      ),
    ),
    getJobs: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  }));

  return {
    Worker: MockWorker,
    Queue: MockQueue,
    UnrecoverableError: class extends Error {
      constructor(m: string) {
        super(m);
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
    }),
  },
}));

const { startWorker, startAllGradingWorkers } = await import(
  "../src/worker/submission.worker.js"
);
const { startGitAnalysisWorker } = await import(
  "../src/git-analytics/git-analysis.worker.js"
);
const { enqueueGitAnalysis } = await import(
  "../src/git-analytics/git-analysis.queue.js"
);
const { enqueueSubmission, enqueueBatch, getBatchProgress } = await import(
  "../src/queue/producer.js"
);

interface MockWorkerInstance {
  name: string;
  emitEvent: (event: string, ...args: unknown[]) => void;
}

describe("Workers and Queues Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should start interactive grading worker with event listeners", () => {
    const worker = startWorker() as unknown as MockWorkerInstance;
    expect(worker.name).toBe("submission-grading");

    // Simulate worker events
    const dummyJob = {
      id: "j1",
      data: { submissionId: "sub1" },
      attemptsMade: 1,
      opts: { attempts: 4 },
    };
    worker.emitEvent("completed", dummyJob, { finalStatus: "GRADED", totalScore: 10 });
    worker.emitEvent("failed", dummyJob, new Error("Temporary failure"));
    worker.emitEvent("error", new Error("Redis connection hiccup"));
  });

  it("should start all grading workers (interactive, batch, ai retry)", () => {
    const workers = startAllGradingWorkers() as unknown as MockWorkerInstance[];
    expect(workers).toHaveLength(3);
    expect(workers[0].name).toBe("submission-grading");
    expect(workers[1].name).toBe("batch-grading");
    expect(workers[2].name).toBe("ai-review-retry");
  });

  it("should start git analysis worker and handle event emissions", () => {
    const worker = startGitAnalysisWorker() as unknown as MockWorkerInstance;
    expect(worker.name).toBe("git-analysis");

    const dummyJob = {
      id: "git-j1",
      data: { analysisId: "a1" },
    };
    worker.emitEvent("completed", dummyJob, { status: "COMPLETED" });
    worker.emitEvent("failed", dummyJob, new Error("Clone failure"));
    worker.emitEvent("error", new Error("Worker error"));
  });

  it("enqueueGitAnalysis should add a job to git-analysis queue", async () => {
    const res = await enqueueGitAnalysis({
      analysisId: "analysis-test-1",
      projectId: "proj-1",
      repoUrl: "https://github.com/org/repo",
      members: [
        {
          studentId: "s1",
          name: "Student",
          emails: ["s1@fpt.edu.vn"],
          githubUsernames: ["s1"],
        },
      ],
      requestedBy: "lecturer-1",
    });

    expect(res.jobId).toBe("analysis-test-1");
  });

  it("producer re-exports should operate as expected", async () => {
    const res = await enqueueSubmission({
      submissionId: "sub-producer-test",
      assignmentId: "assign-1",
      studentId: "stu-1",
      language: "java",
      fileRelativePath: "uploads/test.zip",
      submittedAt: new Date().toISOString(),
    });
    expect(res.jobId).toBe("sub-producer-test");

    const batchRes = await enqueueBatch([
      {
        submissionId: "sub-producer-batch-1",
        assignmentId: "assign-1",
        studentId: "stu-1",
        language: "java",
        fileRelativePath: "uploads/test.zip",
        submittedAt: new Date().toISOString(),
      },
    ]);
    expect(batchRes.count).toBe(1);

    const progress = await getBatchProgress("batch-prod-test");
    expect(progress.batchId).toBe("batch-prod-test");
  });
});
