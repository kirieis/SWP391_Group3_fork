import { Queue } from "bullmq";
import { redisConnection } from "../queue/submission.queue.js";
import { logger } from "../logger.js";
import type { GitAnalysisJobPayload } from "../contracts/git-analytics.contract.js";

/**
 * BullMQ Queue: git-analysis (US-11)
 * Isolated queue so long git clones never block or delay automated grading.
 */
export const gitAnalysisQueue = new Queue<GitAnalysisJobPayload>(
  "git-analysis",
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  },
);

/**
 * Enqueue a git repository analysis task.
 */
export async function enqueueGitAnalysis(
  payload: GitAnalysisJobPayload,
): Promise<{ jobId: string }> {
  const job = await gitAnalysisQueue.add("analyze-repo", payload, {
    jobId: payload.analysisId,
  });

  logger.info(
    {
      analysisId: payload.analysisId,
      jobId: job.id,
      repoUrl: payload.repoUrl,
    },
    "Git analysis task enqueued",
  );

  return { jobId: job.id as string };
}
