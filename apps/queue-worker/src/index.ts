import { logger } from "./logger.js";
import { startAllGradingWorkers } from "./worker/submission.worker.js";
import { startGitAnalysisWorker } from "./git-analytics/git-analysis.worker.js";
import {
  redisConnection,
  verifyRedisPolicy,
} from "./queue/submission.queue.js";
import { config } from "./config.js";

/**
 * Health check helper for container deployment and monitoring.
 */
export async function checkHealth(): Promise<{
  status: "ok" | "degraded" | "error";
  redis: boolean;
  redisPolicy: string;
  uptimeSec: number;
}> {
  try {
    const pong = await redisConnection.ping();
    const { policy } = await verifyRedisPolicy();
    return {
      status: pong === "PONG" ? "ok" : "degraded",
      redis: pong === "PONG",
      redisPolicy: policy,
      uptimeSec: Math.floor(process.uptime()),
    };
  } catch {
    return {
      status: "error",
      redis: false,
      redisPolicy: "unknown",
      uptimeSec: Math.floor(process.uptime()),
    };
  }
}

/**
 * Entry point for Module 5 — Queue Worker & Git Analytics Engine.
 */
async function main(): Promise<void> {
  logger.info(
    {
      nodeEnv: config.NODE_ENV,
      useMocks: config.USE_MOCKS,
      redisHost: config.REDIS_HOST,
      redisPort: config.REDIS_PORT,
      workerConcurrency: config.WORKER_CONCURRENCY,
      batchConcurrency: config.BATCH_CONCURRENCY,
      gitWorkerConcurrency: config.GIT_WORKER_CONCURRENCY,
    },
    "🔧 Module 5 — Queue Worker & Git Analytics Engine starting...",
  );

  // ── Redis Connection & Policy Check ────────────────────────────────────
  try {
    await redisConnection.ping();
    logger.info("Connected to Redis successfully");
    await verifyRedisPolicy();
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      "Failed to connect to Redis on startup",
    );
  }

  // ── Start Workers ──────────────────────────────────────────────────────
  const gradingWorkers = startAllGradingWorkers();
  const gitWorker = startGitAnalysisWorker();
  const allWorkers = [...gradingWorkers, gitWorker];

  // ── Graceful Shutdown ──────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, `Received ${signal} — shutting down gracefully...`);

    try {
      // Close all workers (wait for active jobs to finish)
      await Promise.all(allWorkers.map((w) => w.close()));
      logger.info("All workers closed cleanly");

      // Close Redis connection
      await redisConnection.quit();
      logger.info("Redis connection closed");
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "Error during graceful shutdown",
      );
    }

    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

if (process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    logger.fatal({ error: err }, "Fatal error starting worker");
    process.exit(1);
  });
}
