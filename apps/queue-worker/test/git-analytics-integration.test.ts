import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Job } from "bullmq";
import { GitRunner } from "../src/git-analytics/git-runner.js";
import { parseGitLog } from "../src/git-analytics/log-parser.js";
import { mapCommitsToMembers } from "../src/git-analytics/identity-mapper.js";
import { computeContributionShare } from "../src/git-analytics/contribution.js";
import { processGitAnalysis } from "../src/git-analytics/git-analysis.processor.js";
import type {
  GitAnalysisJobPayload,
  TeamMember,
} from "../src/contracts/git-analytics.contract.js";

const execFileAsync = promisify(execFile);

describe("Git Analytics Integration Tests (Real Git Repo)", () => {
  let tempRepoDir = "";

  const members: TeamMember[] = [
    {
      studentId: "STU01",
      name: "Alice Developer",
      emails: ["alice@swp391.edu.vn"],
      githubUsernames: ["alice_dev"],
    },
    {
      studentId: "STU02",
      name: "Bob Contributor",
      emails: ["bob@swp391.edu.vn"],
      githubUsernames: ["bob_contrib"],
    },
    {
      studentId: "STU03",
      name: "Charlie FreeRider",
      emails: ["charlie@swp391.edu.vn"],
      githubUsernames: ["charlie_fr"],
    },
  ];

  beforeAll(async () => {
    // Create a local git repo simulating real teamwork
    tempRepoDir = path.join(
      os.tmpdir(),
      `test_repo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    );
    await fs.mkdir(tempRepoDir, { recursive: true });

    // Initialize git repo
    await execFileAsync("git", ["init"], { cwd: tempRepoDir });
    await execFileAsync("git", ["config", "user.name", "Initial Author"], {
      cwd: tempRepoDir,
    });
    await execFileAsync("git", ["config", "user.email", "init@swp391.edu.vn"], {
      cwd: tempRepoDir,
    });

    // Helper to create commits
    const makeCommit = async (
      fileName: string,
      content: string,
      authorName: string,
      authorEmail: string,
      message: string,
    ) => {
      await fs.writeFile(path.join(tempRepoDir, fileName), content, "utf-8");
      await execFileAsync("git", ["add", fileName], { cwd: tempRepoDir });
      await execFileAsync(
        "git",
        [
          "commit",
          `--author=${authorName} <${authorEmail}>`,
          "-m",
          message,
        ],
        { cwd: tempRepoDir },
      );
    };

    // Alice commits 3 times (lots of additions)
    await makeCommit(
      "index.ts",
      "console.log('Hello');\nconsole.log('World');\nconsole.log('Alice 1');\n",
      "Alice Developer",
      "alice@swp391.edu.vn",
      "feat: initial setup by Alice",
    );
    await makeCommit(
      "service.ts",
      "export class Service {\n  run() {\n    return 42;\n  }\n}\n",
      "Alice Developer",
      "alice@swp391.edu.vn",
      "feat: service implementation",
    );
    await makeCommit(
      "utils.ts",
      "export const add = (a: number, b: number) => a + b;\n",
      "Alice Developer",
      "alice@swp391.edu.vn",
      "feat: utility functions",
    );

    // Bob commits 2 times
    await makeCommit(
      "test.ts",
      "import { add } from './utils';\nconsole.log(add(1, 2));\n",
      "Bob Contributor",
      "bob@swp391.edu.vn",
      "test: add unit test",
    );
    await makeCommit(
      "readme.md",
      "# Project Documentation\nCreated by the team.\n",
      "Bob Contributor",
      "bob@swp391.edu.vn",
      "docs: update readme",
    );

    // Charlie does NOT commit (or commits nothing)
  });

  afterAll(async () => {
    try {
      await fs.rm(tempRepoDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("should parse real commits, map authors, and detect Charlie as free-rider", async () => {
    const rawLog = await GitRunner.getLogNumstat(tempRepoDir);
    expect(rawLog).toBeTruthy();

    const parsed = parseGitLog(rawLog);
    expect(parsed.length).toBe(5);

    const mapped = mapCommitsToMembers(parsed, members);
    expect(mapped.totals.commits).toBe(5);

    const alice = mapped.memberStats.find((m) => m.studentId === "STU01")!;
    const bob = mapped.memberStats.find((m) => m.studentId === "STU02")!;
    const charlie = mapped.memberStats.find((m) => m.studentId === "STU03")!;

    expect(alice.commits).toBe(3);
    expect(bob.commits).toBe(2);
    expect(charlie.commits).toBe(0);

    const evalResult = computeContributionShare(
      mapped.memberStats,
      mapped.totals,
      { freeRiderThresholdPercent: 5 },
    );

    // Charlie has 0 commits and total is 5 -> flagged as free-rider!
    const charlieEval = evalResult.memberStats.find(
      (m) => m.studentId === "STU03",
    )!;
    expect(charlieEval.isFreeRider).toBe(true);
    expect(charlieEval.sharePercent).toBe(0);

    // Alice and Bob are active
    const aliceEval = evalResult.memberStats.find(
      (m) => m.studentId === "STU01",
    )!;
    expect(aliceEval.isFreeRider).toBe(false);
    expect(aliceEval.sharePercent).toBeGreaterThan(50);
  });

  it("processGitAnalysis should reject forbidden/malicious URL without throwing", async () => {
    const payload: GitAnalysisJobPayload = {
      analysisId: "analysis-malicious-url",
      projectId: "proj-001",
      repoUrl: "--upload-pack=evil",
      members,
      requestedBy: "lecturer-001",
    };

    const mockJob = {
      id: "job-malicious",
      data: payload,
    } as unknown as Job<GitAnalysisJobPayload>;

    const result = await processGitAnalysis(mockJob);

    expect(result.status).toBe("FAILED");
    expect(result.failureReason).toBe("INVALID_URL");
    expect(result.failureMessage).toBeDefined();
  });

  it("processGitAnalysis should process full workflow with free-rider detection", async () => {
    const cloneSpy = vi.spyOn(GitRunner, "cloneBare").mockResolvedValue({
      repoDir: "/mock/repo/dir",
      cleanup: vi.fn().mockResolvedValue(undefined),
    });
    const logSpy = vi.spyOn(GitRunner, "getLogNumstat").mockResolvedValue(
      `RECORD_SEP\x1fsha1\x1fAlice Developer\x1falice@swp391.edu.vn\x1f2026-10-10\x1ffeat: 1\n50\t5\tsrc/1.ts\n` +
      `RECORD_SEP\x1fsha2\x1fAlice Developer\x1falice@swp391.edu.vn\x1f2026-10-10\x1ffeat: 2\n50\t5\tsrc/2.ts\n` +
      `RECORD_SEP\x1fsha3\x1fAlice Developer\x1falice@swp391.edu.vn\x1f2026-10-10\x1ffeat: 3\n50\t5\tsrc/3.ts\n` +
      `RECORD_SEP\x1fsha4\x1fBob Contributor\x1fbob@swp391.edu.vn\x1f2026-10-10\x1ffeat: 4\n40\t5\tsrc/4.ts\n` +
      `RECORD_SEP\x1fsha5\x1fBob Contributor\x1fbob@swp391.edu.vn\x1f2026-10-10\x1ffeat: 5\n40\t5\tsrc/5.ts\n`,
    );

    const payload: GitAnalysisJobPayload = {
      analysisId: "analysis-happy-path",
      projectId: "proj-happy",
      repoUrl: "https://github.com/swp391-group3/project-repo",
      members,
      requestedBy: "lecturer-001",
    };

    const mockJob = {
      id: "job-happy",
      data: payload,
    } as unknown as Job<GitAnalysisJobPayload>;

    const result = await processGitAnalysis(mockJob);

    expect(result.status).toBe("FREE_RIDER_DETECTED");
    expect(result.totals.commits).toBe(5);
    expect(result.memberStats).toHaveLength(3);

    cloneSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("processGitAnalysis should handle empty repository", async () => {
    const cloneSpy = vi.spyOn(GitRunner, "cloneBare").mockResolvedValue({
      repoDir: "/mock/repo/empty",
      cleanup: vi.fn().mockResolvedValue(undefined),
    });
    const logSpy = vi.spyOn(GitRunner, "getLogNumstat").mockResolvedValue("");

    const payload: GitAnalysisJobPayload = {
      analysisId: "analysis-empty-repo",
      projectId: "proj-empty",
      repoUrl: "https://github.com/swp391-group3/empty-repo",
      members,
      requestedBy: "lecturer-001",
    };

    const mockJob = {
      id: "job-empty",
      data: payload,
    } as unknown as Job<GitAnalysisJobPayload>;

    const result = await processGitAnalysis(mockJob);

    expect(result.status).toBe("FAILED");
    expect(result.failureReason).toBe("EMPTY_REPO");

    cloneSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("processGitAnalysis should handle repository clone failure (not found)", async () => {
    const cloneSpy = vi
      .spyOn(GitRunner, "cloneBare")
      .mockRejectedValue(new Error("REPO_NOT_FOUND_OR_NO_ACCESS: private"));

    const payload: GitAnalysisJobPayload = {
      analysisId: "analysis-not-found",
      projectId: "proj-404",
      repoUrl: "https://github.com/swp391-group3/secret-repo",
      members,
      requestedBy: "lecturer-001",
    };

    const mockJob = {
      id: "job-404",
      data: payload,
    } as unknown as Job<GitAnalysisJobPayload>;

    const result = await processGitAnalysis(mockJob);

    expect(result.status).toBe("FAILED");
    expect(result.failureReason).toBe("REPO_NOT_FOUND_OR_NO_ACCESS");

    cloneSpy.mockRestore();
  });
});
