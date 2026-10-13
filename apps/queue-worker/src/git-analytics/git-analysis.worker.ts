import { Worker } from "bullmq";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { redisConnection } from "../queue/submission.queue.js";
import { processGitAnalysis } from "./git-analysis.processor.js";
import type { GitAnalysisJobPayload } from "../contracts/git-analytics.contract.js";

/**
 * BullMQ Worker for the git-analysis queue.
 */
export function startGitAnalysisWorker(): Worker<GitAnalysisJobPayload> {
  const worker = new Worker<GitAnalysisJobPayload>(
    "git-analysis",
    processGitAnalysis,
    {
      connection: redisConnection,
      concurrency: config.GIT_WORKER_CONCURRENCY,
    },
  );

  worker.on("completed", (job, result) => {
    logger.info(
      {
        jobId: job.id,
        analysisId: job.data.analysisId,
        status: result.status,
      },
      `✅ Git analysis completed: ${job.data.analysisId}`,
    );
  });

  worker.on("failed", (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        analysisId: job?.data.analysisId,
        error: err.message,
      },
      `❌ Git analysis failed: ${job?.data.analysisId}`,
    );
  });

  worker.on("error", (err) => {
    logger.error({ error: err.message }, "Worker error event on git-analysis queue");
  });

  logger.info(
    {
      concurrency: config.GIT_WORKER_CONCURRENCY,
    },
    "🚀 Git analysis worker started",
  );

  return worker;
}
