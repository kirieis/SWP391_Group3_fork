import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GitRunner } from "../src/git-analytics/git-runner.js";

const execFileAsync = promisify(execFile);

describe("GitRunner Unit Tests", () => {
  let emptyGitDir = "";

  beforeAll(async () => {
    emptyGitDir = path.join(
      os.tmpdir(),
      `test_empty_git_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    );
    await fs.mkdir(emptyGitDir, { recursive: true });
    await execFileAsync("git", ["init"], { cwd: emptyGitDir });
  });

  afterAll(async () => {
    try {
      await fs.rm(emptyGitDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("cloneBare should throw REPO_NOT_FOUND_OR_NO_ACCESS for nonexistent repo", async () => {
    await expect(
      GitRunner.cloneBare(
        "https://github.com/nonexistent-org-xyz-987654321/no-such-repo.git",
        { timeoutMs: 15_000 },
      ),
    ).rejects.toThrow("REPO_NOT_FOUND_OR_NO_ACCESS");
  }, 20_000);

  it("getLogNumstat should return empty string for repo with no commits", async () => {
    const log = await GitRunner.getLogNumstat(emptyGitDir);
    expect(log).toBe("");
  });

  it("getLogNumstat should throw for invalid repository directory", async () => {
    const invalidDir = path.join(os.tmpdir(), "nonexistent-dir-for-git-log");
    await expect(GitRunner.getLogNumstat(invalidDir)).rejects.toThrow(
      "Failed to read git log",
    );
  });
});
