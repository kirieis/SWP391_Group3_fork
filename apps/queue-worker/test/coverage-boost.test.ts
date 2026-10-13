import { describe, it, expect, vi } from "vitest";
import axios from "axios";
import { computeContributionShare } from "../src/git-analytics/contribution.js";
import { validateRepoUrl } from "../src/git-analytics/url-validator.js";
import { parseGitLog } from "../src/git-analytics/log-parser.js";
import { analyzeRepository } from "../src/services/git-analytics.service.js";
import { startWorker } from "../src/worker/submission.worker.js";
import { verifyRedisPolicy } from "../src/queue/submission.queue.js";

// Mock ioredis
vi.mock("ioredis", () => {
  const MockRedis = vi.fn().mockImplementation(() => ({
    ping: vi.fn().mockResolvedValue("PONG"),
    config: vi.fn().mockImplementation((cmd, key) => {
      return Promise.resolve([key, "volatile-lru"]); // Non-compliant to trigger warning branch
    }),
    quit: vi.fn().mockResolvedValue("OK"),
  }));
  return { Redis: MockRedis, default: MockRedis };
});

describe("Branch Coverage Boost", () => {
  // ── 1. Contribution Edge Cases ─────────────────────────────────────────────
  it("computeContributionShare handles zero commits and zero LOC", () => {
    const emptyResult = computeContributionShare(
      [
        {
          studentId: "s1",
          name: "User 1",
          commits: 0,
          additions: 0,
          deletions: 0,
          net: 0,
          sharePercent: 0,
          isFreeRider: false,
        },
      ],
      { commits: 0, additions: 0, deletions: 0 },
    );
    expect(emptyResult.lowActivity).toBe(true);

    const zeroLocResult = computeContributionShare(
      [
        {
          studentId: "s1",
          name: "User 1",
          commits: 6,
          additions: 0,
          deletions: 0,
          net: 0,
          sharePercent: 0,
          isFreeRider: false,
        },
        {
          studentId: "s2",
          name: "User 2",
          commits: 4,
          additions: 0,
          deletions: 0,
          net: 0,
          sharePercent: 0,
          isFreeRider: false,
        },
      ],
      { commits: 10, additions: 0, deletions: 0 },
    );
    expect(zeroLocResult.hasFreeRiders).toBe(false);
  });

  // ── 2. URL Validator Edge Cases ───────────────────────────────────────────
  it("validateRepoUrl handles invalid name structures", () => {
    expect(validateRepoUrl("").isValid).toBe(false);
    expect(validateRepoUrl("https://github.com/-invalid/repo").isValid).toBe(false);
    expect(validateRepoUrl("https://github.com/owner/-invalid").isValid).toBe(false);
    expect(validateRepoUrl("https://github.com/owner/.").isValid).toBe(false);
    expect(validateRepoUrl("https://github.com/owner/..").isValid).toBe(false);
    expect(validateRepoUrl("https://github.com/owner/repo/extra/path").isValid).toBe(false);
  });

  // ── 3. Log Parser Edge Cases ──────────────────────────────────────────────
  it("parseGitLog handles empty string or malformed lines", () => {
    expect(parseGitLog("")).toEqual([]);
    expect(parseGitLog("   ")).toEqual([]);
    expect(parseGitLog("RECORD_SEP\x1fincomplete\n")).toEqual([]);
  });

  // ── 4. Git Analytics Service with Mocked Axios API ────────────────────────
  it("analyzeRepository parses real API response with commits and stats", async () => {
    const getSpy = vi.spyOn(axios, "get").mockImplementation((url: string) => {
      if (url.includes("/commits/sha1")) {
        return Promise.resolve({
          data: { stats: { additions: 25, deletions: 5 } },
        }) as unknown as Promise<AxiosResponse>;
      }
      return Promise.resolve({
        data: [
          {
            sha: "sha1",
            commit: {
              author: { name: "Alice", email: "alice@swp.vn", date: "2026-10-10" },
              message: "Test commit",
            },
          },
        ],
      }) as unknown as Promise<AxiosResponse>;
    });

    const res = await analyzeRepository("https://github.com/swp/test-repo", {
      sampleSize: 1,
    });

    expect(res.totalCommits).toBe(1);
    expect(res.memberStats[0].additions).toBe(25);
    getSpy.mockRestore();
  });

  // ── 5. Worker Exhausted Failure Callback ───────────────────────────────────
  it("worker failed listener calls reportExhaustedFailure on 4 attempts", async () => {
    const worker = startWorker() as unknown as {
      emit: (event: string, ...args: unknown[]) => boolean;
      close: () => Promise<void>;
    };
    const dummyJob = {
      id: "j-exhausted",
      data: { submissionId: "sub-exhausted" },
      attemptsMade: 4,
      opts: { attempts: 4 },
    };

    worker.emit("failed", dummyJob, new Error("Final fatal exhaustion"));
    worker.emit("failed", null, new Error("Lost reference"));
    await worker.close();
  });

  // ── 6. Non-compliant Redis Policy ─────────────────────────────────────────
  it("verifyRedisPolicy warns when policy is not noeviction", async () => {
    const res = await verifyRedisPolicy();
    expect(res.policy).toBe("volatile-lru");
    expect(res.isCompliant).toBe(false);
  });

  // ── 7. State Machine and Parser Branches ─────────────────────────────────
  it("covers terminal states and rename branches", async () => {
    const { isTerminalState } = await import("../src/git-analytics/state-machine.js");
    const { cleanRenamePath } = await import("../src/git-analytics/log-parser.js");
    const { GitRunner } = await import("../src/git-analytics/git-runner.js");
    const { processGitAnalysis } = await import("../src/git-analytics/git-analysis.processor.js");

    expect(isTerminalState("FAILED")).toBe(true);
    expect(isTerminalState("FREE_RIDER_DETECTED")).toBe(true);
    expect(isTerminalState("CLONING")).toBe(false);

    expect(cleanRenamePath("old.ts => new.ts")).toBe("new.ts");
    expect(cleanRenamePath("src/{old => new}/index.ts")).toBe("src/new/index.ts");
    expect(cleanRenamePath("regular.ts")).toBe("regular.ts");

    // Test processGitAnalysis with TIMEOUT error branch
    const cloneSpy = vi.spyOn(GitRunner, "cloneBare").mockRejectedValue(new Error("TIMEOUT: clone timed out"));
    const job = {
      id: "job-timeout",
      data: {
        analysisId: "a-timeout",
        projectId: "p-timeout",
        repoUrl: "https://github.com/org/timeout-repo",
        members: [{ studentId: "s1", name: "S1", emails: ["s1@fpt.edu.vn"], githubUsernames: [] }],
        requestedBy: "lec-1",
      },
    } as unknown as Parameters<typeof processGitAnalysis>[0];

    const res = await processGitAnalysis(job);
    expect(res.status).toBe("FAILED");
    expect(res.failureReason).toBe("TIMEOUT");
    cloneSpy.mockRestore();
  });

  // ── 8. Batch empty ───────────────────────────────────────────────────────
  it("covers enqueueBatch empty", async () => {
    const { enqueueBatch } = await import("../src/queue/submission.queue.js");
    const emptyBatch = await enqueueBatch([]);
    expect(emptyBatch.count).toBe(0);
  });
});
