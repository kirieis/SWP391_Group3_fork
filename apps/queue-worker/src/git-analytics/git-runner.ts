import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../config.js";
import { logger } from "../logger.js";

const execFileAsync = promisify(execFile);

export interface GitCloneResult {
  repoDir: string;
  cleanup: () => Promise<void>;
}

/**
 * Git Runner with process isolation and hardened security settings.
 * The ONLY module authorized to invoke the `git` binary.
 */
export class GitRunner {
  private static getSafeEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_ASKPASS: "echo",
      GIT_CONFIG_NOSYSTEM: "1",
      LC_ALL: "C",
    };
  }

  /**
   * Clone repository as a bare repo into a secure isolated temporary directory.
   */
  static async cloneBare(
    sanitizedUrl: string,
    options: {
      branch?: string;
      timeoutMs?: number;
    } = {},
  ): Promise<GitCloneResult> {
    const timeout = options.timeoutMs ?? config.GIT_CLONE_TIMEOUT_MS;
    const baseDir = path.resolve(config.GIT_TEMP_DIR || os.tmpdir());
    await fs.mkdir(baseDir, { recursive: true });

    const uniqueId = `git_analysis_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const repoDir = path.join(baseDir, uniqueId);

    const args = [
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "protocol.file.allow=never",
      "clone",
      "--bare",
      "--no-tags",
    ];

    if (options.branch) {
      args.push("--branch", options.branch);
    }

    // Always append "--" before the repository URL
    args.push("--", sanitizedUrl, repoDir);

    logger.info({ sanitizedUrl, repoDir }, "GitRunner: cloning bare repository...");

    try {
      await execFileAsync("git", args, {
        env: this.getSafeEnv(),
        timeout,
        maxBuffer: 5 * 1024 * 1024,
      });

      const cleanup = async () => {
        try {
          await fs.rm(repoDir, { recursive: true, force: true });
          logger.debug({ repoDir }, "Cleaned up temporary git directory");
        } catch (cleanupErr) {
          logger.warn(
            { repoDir, error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr) },
            "Failed to delete temp git directory during cleanup",
          );
        }
      };

      return { repoDir, cleanup };
    } catch (err: unknown) {
      // Ensure directory is cleaned up if clone failed
      try {
        await fs.rm(repoDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error on failure
      }

      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("not found") ||
        message.includes("Repository not found") ||
        message.includes("404") ||
        message.includes("Authentication failed") ||
        message.includes("Invalid username or token")
      ) {
        throw new Error("REPO_NOT_FOUND_OR_NO_ACCESS: Repository not found or is private.");
      }
      if (message.includes("timed out") || message.includes("ETIMEDOUT")) {
        throw new Error("TIMEOUT: Git clone operation timed out.");
      }
      throw new Error(`Git clone failed: ${message}`);
    }
  }

  /**
   * Run `git log --numstat --no-merges` using a machine-parseable format.
   * Format: RECORD_SEP + %H (hash) + UNIT_SEP + %an (author name) + UNIT_SEP + %ae (author email) + UNIT_SEP + %aI (author date ISO) + UNIT_SEP + %s (subject)
   */
  static async getLogNumstat(
    repoDir: string,
    options: {
      maxCommits?: number;
      timeoutMs?: number;
    } = {},
  ): Promise<string> {
    const maxCommits = options.maxCommits ?? config.MAX_COMMITS;
    const timeout = options.timeoutMs ?? 30_000;

    const prettyFormat = "RECORD_SEP%x1f%H%x1f%an%x1f%ae%x1f%aI%x1f%s";

    const args = [
      "-C",
      repoDir,
      "log",
      `--max-count=${maxCommits}`,
      "--no-merges",
      `--pretty=format:${prettyFormat}`,
      "--numstat",
    ];

    try {
      const { stdout } = await execFileAsync("git", args, {
        env: this.getSafeEnv(),
        timeout,
        maxBuffer: 20 * 1024 * 1024, // 20MB buffer for large logs
      });

      return stdout;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("does not have any commits") || message.includes("fatal: your current branch")) {
        return ""; // Empty repository
      }
      throw new Error(`Failed to read git log: ${message}`);
    }
  }
}
