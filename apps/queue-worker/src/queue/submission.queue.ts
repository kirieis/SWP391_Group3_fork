import { Queue } from "bullmq";
import { Redis, type RedisOptions } from "ioredis";
import { config } from "../config.js";
import { logger } from "../logger.js";
import {
  SubmissionJobPayloadSchema,
  type SubmissionJobPayload,
  type SubmissionJobInput,
} from "../contracts/job.contract.js";

/**
 * Shared Redis connection for BullMQ queue operations.
 * Supports REDIS_URL (with TLS rediss://) or host/port/auth fallback.
 */
function createRedisClient(): Redis {
  const commonOpts: RedisOptions = {
    maxRetriesPerRequest: null, // Required by BullMQ
  };

  if (config.REDIS_URL && config.REDIS_URL.trim() !== "") {
    logger.info("Connecting to Redis via REDIS_URL");
    const isTls = config.REDIS_URL.startsWith("rediss://");
    return new Redis(config.REDIS_URL, {
      ...commonOpts,
      tls: isTls ? {} : undefined,
    });
  }

  return new Redis({
    ...commonOpts,
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || undefined,
    db: config.REDIS_DB,
  });
}

export const redisConnection = createRedisClient();

/**
 * Verify Redis maxmemory-policy configuration.
 * BullMQ strictly recommends `maxmemory-policy noeviction`.
 */
export async function verifyRedisPolicy(): Promise<{
  policy: string;
  isCompliant: boolean;
}> {
  try {
    const configResult = (await redisConnection.config(
      "GET",
      "maxmemory-policy",
    )) as string[];
    const policy =
      Array.isArray(configResult) && configResult.length >= 2
        ? configResult[1]
        : "unknown";
    const isCompliant = policy.toLowerCase() === "noeviction";

    if (!isCompliant) {
      logger.warn(
        { policy, expected: "noeviction" },
        "⚠️ WARNING: Redis maxmemory-policy is NOT 'noeviction'! BullMQ requires 'noeviction' to prevent silent job loss.",
      );
    } else {
      logger.info({ policy }, "✅ Redis maxmemory-policy verified: noeviction");
    }

    return { policy, isCompliant };
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      "Could not inspect Redis maxmemory-policy (CONFIG GET command may be restricted)",
    );
    return { policy: "unverified", isCompliant: true };
  }
}

/**
 * BullMQ Queue: submission-grading (interactive, higher priority)
 */
export const submissionQueue = new Queue<SubmissionJobPayload>(
  "submission-grading",
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 4,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  },
);

/**
 * BullMQ Queue: batch-grading (bulk class grading, lower priority & rate limited)
 */
export const batchQueue = new Queue<SubmissionJobPayload, unknown, string>(
  "batch-grading",
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 4,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
    },
  },
);

/**
 * BullMQ Queue: ai-review-retry (delayed retry when GenAI gateway is temporarily unavailable)
 */
export const aiReviewRetryQueue = new Queue<SubmissionJobPayload>(
  "ai-review-retry",
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: config.AI_REVIEW_MAX_RETRY_ROUNDS,
      backoff: {
        type: "fixed",
        delay: config.AI_REVIEW_RETRY_DELAY_MS,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  },
);


/**
 * Enqueue a submission for grading.
 * Idempotency & Re-grade handling:
 * For initial grading: jobId = submissionId
 * For re-grades (appeal / re-run): jobId = `${submissionId}:${gradingRunNo}`
 * Never silently drops an appeal re-grade!
 */
export async function enqueueSubmission(
  payload: SubmissionJobInput,
): Promise<{ jobId: string }> {
  const parsed = SubmissionJobPayloadSchema.parse(payload);
  const gradingRun = parsed.gradingRunNo ?? 1;
  const jobId =
    gradingRun > 1 || parsed.reason === "REGRADE"
      ? `${parsed.submissionId}:${gradingRun}`
      : parsed.submissionId;

  const job = await submissionQueue.add("grade", parsed, {
    jobId,
  });

  logger.info(
    {
      submissionId: parsed.submissionId,
      jobId: job.id,
      reason: parsed.reason,
      gradingRunNo: gradingRun,
    },
    "Submission enqueued for interactive grading",
  );

  return { jobId: job.id as string };
}

/**
 * Enqueue a batch of submissions using `addBulk`.
 * Uses `batch-grading` queue without blocking the API Gateway.
 */
export async function enqueueBatch(
  payloads: SubmissionJobInput[],
): Promise<{ count: number; batchId?: string }> {
  if (payloads.length === 0) {
    return { count: 0 };
  }

  const batchId = payloads[0].batchId ?? `batch_${Date.now()}`;

  const bulkJobs = payloads.map((p, index) => {
    const parsed = SubmissionJobPayloadSchema.parse(p);
    const enrichedPayload: SubmissionJobPayload = {
      ...parsed,
      reason: "BATCH",
      batchId,
    };
    const runNo = enrichedPayload.gradingRunNo ?? 1;
    const jobId = `${batchId}:${enrichedPayload.submissionId}:${runNo}_${index}`;

    return {
      name: "batch-grade" as const,
      data: enrichedPayload,
      opts: {
        jobId,
      },
    };
  });

  const createdJobs = await batchQueue.addBulk(bulkJobs);

  logger.info(
    {
      batchId,
      jobCount: createdJobs.length,
    },
    "Batch submissions enqueued via addBulk",
  );

  return { count: createdJobs.length, batchId };
}

/**
 * Query the progress of a batch by batchId.
 */
export async function getBatchProgress(batchId: string): Promise<{
  batchId: string;
  total: number;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  isComplete: boolean;
}> {
  const [waitingJobs, activeJobs, completedJobs, failedJobs, delayedJobs] =
    await Promise.all([
      batchQueue.getJobs(["waiting"]),
      batchQueue.getJobs(["active"]),
      batchQueue.getJobs(["completed"]),
      batchQueue.getJobs(["failed"]),
      batchQueue.getJobs(["delayed"]),
    ]);

  const matches = (jobList: typeof waitingJobs) =>
    jobList.filter((j) => j.data?.batchId === batchId).length;

  const waiting = matches(waitingJobs);
  const active = matches(activeJobs);
  const completed = matches(completedJobs);
  const failed = matches(failedJobs);
  const delayed = matches(delayedJobs);
  const total = waiting + active + completed + failed + delayed;
  const isComplete = total > 0 && waiting === 0 && active === 0 && delayed === 0;

  return {
    batchId,
    total,
    waiting,
    active,
    completed,
    failed,
    delayed,
    isComplete,
  };
}
