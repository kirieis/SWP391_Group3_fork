import { Worker } from "bullmq";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { redisConnection } from "../queue/submission.queue.js";
import { processSubmission } from "./processor.js";
import type { SubmissionJobPayload } from "../contracts/job.contract.js";
import { Module1Client } from "../clients/module1.client.js";
import { MockModule1Client } from "../clients/mocks/index.js";

function setupWorkerListeners(
  worker: Worker<SubmissionJobPayload>,
  queueName: string,
): void {
  worker.on("completed", (job, result) => {
    logger.info(
      {
        queue: queueName,
        jobId: job.id,
        submissionId: job.data.submissionId,
        attemptsMade: job.attemptsMade,
        finalStatus: result?.finalStatus,
        totalScore: result?.totalScore,
      },
      `✅ [${queueName}] Job completed: ${job.data.submissionId}`,
    );
  });

  worker.on("failed", (job, err) => {
    if (!job) {
      logger.error({ queue: queueName, error: err.message }, "Job reference lost on failure");
      return;
    }

    const isExhausted = job.attemptsMade >= (job.opts.attempts ?? 4);

    logger.error(
      {
        queue: queueName,
        jobId: job.id,
        submissionId: job.data.submissionId,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts.attempts,
        isExhausted,
        error: err.message,
      },
      `❌ [${queueName}] Job failed: ${job.data.submissionId} (attempt ${job.attemptsMade})`,
    );

    if (isExhausted) {
      void reportExhaustedFailure(job.data.submissionId, err.message);
    }
  });

  worker.on("error", (err) => {
    logger.error({ queue: queueName, error: err.message }, `Worker error event on ${queueName}`);
  });
}

/**
 * Create and start the BullMQ Worker for the interactive submission-grading queue.
 */
export function startWorker(): Worker<SubmissionJobPayload> {
  const worker = new Worker<SubmissionJobPayload>(
    "submission-grading",
    processSubmission,
    {
      connection: redisConnection,
      concurrency: config.WORKER_CONCURRENCY,
    },
  );

  setupWorkerListeners(worker, "submission-grading");

  logger.info(
    {
      concurrency: config.WORKER_CONCURRENCY,
      useMocks: config.USE_MOCKS,
    },
    "🚀 Submission grading worker started",
  );

  return worker;
}

/**
 * Start all grading workers (interactive, batch, and AI review retry).
 */
export function startAllGradingWorkers(): Worker<SubmissionJobPayload>[] {
  const interactiveWorker = startWorker();

  const batchWorker = new Worker<SubmissionJobPayload>(
    "batch-grading",
    processSubmission,
    {
      connection: redisConnection,
      concurrency: config.BATCH_CONCURRENCY,
      limiter: {
        max: config.BATCH_RATE_LIMIT_MAX,
        duration: config.BATCH_RATE_LIMIT_DURATION_MS,
      },
    },
  );
  setupWorkerListeners(batchWorker, "batch-grading");

  const aiRetryWorker = new Worker<SubmissionJobPayload>(
    "ai-review-retry",
    processSubmission,
    {
      connection: redisConnection,
      concurrency: 2,
    },
  );
  setupWorkerListeners(aiRetryWorker, "ai-review-retry");

  logger.info(
    {
      batchConcurrency: config.BATCH_CONCURRENCY,
      aiRetryConcurrency: 2,
    },
    "🚀 Batch and AI Retry grading workers started",
  );

  return [interactiveWorker, batchWorker, aiRetryWorker];
}

/**
 * When all retries are exhausted, safely report failure to Module 1
 * so the submission never hangs in RUNNING_TESTS.
 */
async function reportExhaustedFailure(
  submissionId: string,
  errorMessage: string,
): Promise<void> {
  try {
    const module1 = config.USE_MOCKS
      ? new MockModule1Client()
      : new Module1Client();

    await module1.updateSubmissionResult(submissionId, {
      status: "COMPILATION_ERROR",
      step: "COMPLETE",
      progressPercent: 100,
      totalScore: 0,
      message: `Grading failed after all retry attempts: ${errorMessage}`,
    });

    logger.warn({ submissionId }, "Reported exhausted failure to Module 1");
  } catch (callbackErr) {
    logger.error(
      {
        submissionId,
        error:
          callbackErr instanceof Error
            ? callbackErr.message
            : String(callbackErr),
      },
      "Failed to report exhausted failure to Module 1",
    );
  }
}
