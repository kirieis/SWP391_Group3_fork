import type { Job } from "bullmq";
import { logger } from "../logger.js";
import {
  GitAnalysisJobPayloadSchema,
  type GitAnalysisJobPayload,
  type GitAnalysisResult,
  type GitAnalysisCallbackBody,
} from "../contracts/git-analytics.contract.js";
import type {
  GitAnalysisStatus,
  GitAnalysisFailureReason,
} from "../contracts/status.contract.js";
import { validateRepoUrl } from "./url-validator.js";
import { GitRunner } from "./git-runner.js";
import { parseGitLog } from "./log-parser.js";
import { mapCommitsToMembers } from "./identity-mapper.js";
import { computeContributionShare } from "./contribution.js";
import { transition } from "./state-machine.js";
import { clients } from "../worker/processor.js";
import { ValidationError } from "../worker/error-classifier.js";

async function notifyModule1GitStatus(
  analysisId: string,
  body: GitAnalysisCallbackBody,
): Promise<void> {
  try {
    if (clients.module1.updateGitAnalysisResult) {
      await clients.module1.updateGitAnalysisResult(analysisId, body);
    }
  } catch (err) {
    logger.warn(
      { analysisId, error: err instanceof Error ? err.message : String(err) },
      "Failed to notify Module 1 of git analysis status",
    );
  }
}

/**
 * BullMQ Processor for the `git-analysis` queue.
 */
export async function processGitAnalysis(
  job: Job<GitAnalysisJobPayload>,
): Promise<GitAnalysisResult> {
  const startTime = Date.now();
  const jobLog = logger.child({
    jobId: job.id,
    analysisId: job.data.analysisId,
    projectId: job.data.projectId,
  });

  // ── Step 1: Validate Job Payload ──────────────────────────────────────
  const parseResult = GitAnalysisJobPayloadSchema.safeParse(job.data);
  if (!parseResult.success) {
    const errorMsg = `Invalid Git Analysis job payload: ${parseResult.error.message}`;
    jobLog.error({ errors: parseResult.error.flatten() }, errorMsg);
    throw new ValidationError(errorMsg);
  }

  const payload = parseResult.data;
  let currentState: GitAnalysisStatus = "CLONING";

  // ── Step 2: Validate Repository URL (Security Gate) ───────────────────
  const urlValidation = validateRepoUrl(payload.repoUrl);
  if (!urlValidation.isValid || !urlValidation.sanitizedUrl) {
    currentState = transition(currentState, "FAIL");
    const failureReason: GitAnalysisFailureReason = "INVALID_URL";
    const failureMessage =
      urlValidation.error ?? "Invalid repository URL or forbidden host/protocol.";

    const failedResult: GitAnalysisResult = {
      analysisId: payload.analysisId,
      projectId: payload.projectId,
      repository: payload.repoUrl,
      repoUrl: payload.repoUrl,
      status: "FAILED",
      failureReason,
      failureMessage,
      totals: { commits: 0, additions: 0, deletions: 0, netLoc: 0 },
      memberStats: [],
      unmapped: [],
      lowActivity: true,
      analyzedAt: new Date().toISOString(),
    };

    await notifyModule1GitStatus(payload.analysisId, {
      status: "FAILED",
      progressPercent: 100,
      message: `Analysis failed: ${failureMessage}`,
      result: failedResult,
    });

    jobLog.warn({ failureReason }, "Git Analysis failed URL validation");
    return failedResult;
  }

  // ── Step 3: Clone Repository (CLONING) ─────────────────────────────────
  await notifyModule1GitStatus(payload.analysisId, {
    status: "CLONING",
    progressPercent: 20,
    message: "Cloning repository safely...",
  });

  let cleanup: (() => Promise<void>) | undefined;
  let repoDir = "";

  try {
    const cloneResult = await GitRunner.cloneBare(urlValidation.sanitizedUrl, {
      branch: payload.branch,
    });
    repoDir = cloneResult.repoDir;
    cleanup = cloneResult.cleanup;

    // ── Step 4: Parse Commits (PARSING_COMMITS) ─────────────────────────
    currentState = transition(currentState, "CLONE_SUCCESS");
    await notifyModule1GitStatus(payload.analysisId, {
      status: currentState,
      progressPercent: 40,
      message: "Parsing git commits and numstat logs...",
    });

    const rawLog = await GitRunner.getLogNumstat(repoDir);
    const parsedCommits = parseGitLog(rawLog);

    if (parsedCommits.length === 0) {
      currentState = transition(currentState, "FAIL");
      const emptyResult: GitAnalysisResult = {
        analysisId: payload.analysisId,
        projectId: payload.projectId,
        repository: `${urlValidation.owner}/${urlValidation.repo}`,
        repoUrl: urlValidation.sanitizedUrl,
        status: "FAILED",
        failureReason: "EMPTY_REPO",
        failureMessage: "Repository has no commits on the targeted branch.",
        totals: { commits: 0, additions: 0, deletions: 0, netLoc: 0 },
        memberStats: payload.members.map((m) => ({
          studentId: m.studentId,
          name: m.name,
          commits: 0,
          additions: 0,
          deletions: 0,
          net: 0,
          sharePercent: 0,
          isFreeRider: false,
        })),
        unmapped: [],
        lowActivity: true,
        analyzedAt: new Date().toISOString(),
      };

      await notifyModule1GitStatus(payload.analysisId, {
        status: "FAILED",
        progressPercent: 100,
        message: "Repository is empty.",
        result: emptyResult,
      });

      return emptyResult;
    }

    // ── Step 5: Calculate LOC & Identity Mapping (CALCULATING_LOC) ─────
    currentState = transition(currentState, "PARSE_SUCCESS");
    await notifyModule1GitStatus(payload.analysisId, {
      status: currentState,
      progressPercent: 60,
      message: "Mapping commits to team members and filtering assets...",
    });

    const mapped = mapCommitsToMembers(parsedCommits, payload.members);

    // ── Step 6: Evaluate Contribution & Free-Riders (EVALUATING) ────────
    currentState = transition(currentState, "CALCULATE_SUCCESS");
    await notifyModule1GitStatus(payload.analysisId, {
      status: currentState,
      progressPercent: 80,
      message: "Evaluating individual contribution shares...",
    });

    const evaluation = computeContributionShare(
      mapped.memberStats,
      mapped.totals,
    );

    const finalState = evaluation.hasFreeRiders
      ? transition(currentState, "FREE_RIDER_FOUND")
      : transition(currentState, "EVALUATION_CLEAN");

    const result: GitAnalysisResult = {
      analysisId: payload.analysisId,
      projectId: payload.projectId,
      repository: `${urlValidation.owner}/${urlValidation.repo}`,
      repoUrl: urlValidation.sanitizedUrl,
      status: finalState,
      totals: mapped.totals,
      memberStats: evaluation.memberStats,
      unmapped: mapped.unmapped,
      lowActivity: evaluation.lowActivity,
      commitRange: {
        firstCommitSha: parsedCommits[parsedCommits.length - 1]?.sha,
        lastCommitSha: parsedCommits[0]?.sha,
        totalCommits: parsedCommits.length,
      },
      analyzedAt: new Date().toISOString(),
    };

    // ── Step 7: Complete and notify Module 1 ────────────────────────────
    await notifyModule1GitStatus(payload.analysisId, {
      status: finalState,
      progressPercent: 100,
      message:
        finalState === "FREE_RIDER_DETECTED"
          ? "Analysis completed: Free-rider(s) detected (< 5% contribution share)."
          : "Analysis completed successfully.",
      result,
    });

    const elapsed = Date.now() - startTime;
    jobLog.info(
      {
        finalState,
        totalCommits: parsedCommits.length,
        hasFreeRiders: evaluation.hasFreeRiders,
        elapsedMs: elapsed,
      },
      `Git Analysis complete: ${finalState}`,
    );

    return result;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    jobLog.error({ error: errorMsg }, "Git Analysis execution failed");

    let failureReason: GitAnalysisFailureReason = "SYSTEM_ERROR";
    if (errorMsg.includes("REPO_NOT_FOUND_OR_NO_ACCESS")) {
      failureReason = "REPO_NOT_FOUND_OR_NO_ACCESS";
    } else if (errorMsg.includes("TIMEOUT")) {
      failureReason = "TIMEOUT";
    }

    const failedResult: GitAnalysisResult = {
      analysisId: payload.analysisId,
      projectId: payload.projectId,
      repository: payload.repoUrl,
      repoUrl: payload.repoUrl,
      status: "FAILED",
      failureReason,
      failureMessage: errorMsg,
      totals: { commits: 0, additions: 0, deletions: 0, netLoc: 0 },
      memberStats: [],
      unmapped: [],
      lowActivity: true,
      analyzedAt: new Date().toISOString(),
    };

    await notifyModule1GitStatus(payload.analysisId, {
      status: "FAILED",
      progressPercent: 100,
      message: `Git Analysis failed: ${errorMsg}`,
      result: failedResult,
    });

    return failedResult;
  } finally {
    if (cleanup) {
      await cleanup();
    }
  }
}
