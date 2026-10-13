import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

/**
 * Zod-validated environment configuration for Milestone 3.
 * Fails fast at startup if required variables are missing or invalid.
 */
const envSchema = z.object({
  // Redis
  REDIS_URL: z.string().optional().default(""),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().default(""),
  REDIS_DB: z.coerce.number().int().min(0).default(0),

  // Grading Worker
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),

  // Batch Grading
  BATCH_CONCURRENCY: z.coerce.number().int().positive().default(2),
  BATCH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  BATCH_RATE_LIMIT_DURATION_MS: z.coerce.number().int().positive().default(1000),

  // Module 1 — API Gateway
  API_GATEWAY_URL: z.string().url().default("http://localhost:5000"),
  INTERNAL_API_KEY: z.string().min(1).default("aita_internal_secret_key_2026"),

  // Module 2 — Docker Sandbox
  SANDBOX_URL: z.string().url().default("http://localhost:5001"),
  SANDBOX_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  // Module 3 — GenAI Gateway (Huy)
  GENAI_GATEWAY_URL: z.string().url().default("http://localhost:5002"),
  GENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  AI_REVIEW_RETRY_DELAY_MS: z.coerce.number().int().positive().default(30000),
  AI_REVIEW_MAX_RETRY_ROUNDS: z.coerce.number().int().positive().default(3),

  // Module 4 — AST Plagiarism Engine (Nhật, port 8000; timeout > 10s analyze + 30s compare/batch per B4)
  AST_ENGINE_URL: z.string().url().default("http://localhost:8000"),
  AST_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),

  // Pipeline overall timeout
  PIPELINE_TIMEOUT_MS: z.coerce.number().int().positive().default(90000),

  // Git Analytics (US-11)
  GIT_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  GIT_HOST_ALLOWLIST: z
    .string()
    .default("github.com")
    .transform((val) =>
      val
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean),
    ),
  GIT_CLONE_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  MAX_REPO_SIZE_MB: z.coerce.number().int().positive().default(100),
  MAX_COMMITS: z.coerce.number().int().positive().default(5000),
  FREE_RIDER_THRESHOLD_PERCENT: z.coerce.number().min(0).max(100).default(5),
  CONTRIBUTION_COMMIT_WEIGHT: z.coerce.number().min(0).max(1).default(0.5),
  CONTRIBUTION_LOC_WEIGHT: z.coerce.number().min(0).max(1).default(0.5),
  GIT_TEMP_DIR: z.string().default("./tmp/git"),

  // Mock mode
  USE_MOCKS: z
    .string()
    .transform((v) => v.toLowerCase() === "true")
    .default("false"),

  // Logging & Environment
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type AppConfig = z.infer<typeof envSchema>;

function loadConfig(): AppConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.flatten().fieldErrors;
    console.error("❌ Invalid environment variables:", formatted);
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
