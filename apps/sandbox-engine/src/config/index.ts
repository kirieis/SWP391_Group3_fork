import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables from .env if present
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const configSchema = z.object({
  // Server
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().default(5001),
  INTERNAL_TOKEN: z.string().min(8, 'INTERNAL_TOKEN must be at least 8 characters long'),

  // Reporter / Callback
  CORE_API_URL: z.string().url().default('http://localhost:5000'),
  CORE_API_KEY: z.string().default('aita_internal_secret_key_2026'),

  // Concurrency & Queuing
  MAX_CONCURRENT_CONTAINERS: z.coerce.number().int().positive().default(4),
  MAX_QUEUE_SIZE: z.coerce.number().int().positive().default(20),

  // Sandbox Security & Resource limits
  SANDBOX_MEMORY_MB: z.coerce.number().int().positive().default(512),
  SANDBOX_CPUS: z.coerce.number().positive().default(1.0),
  SANDBOX_PIDS_LIMIT: z.coerce.number().int().positive().default(64),
  SANDBOX_TMPFS_SIZE_MB: z.coerce.number().int().positive().default(64),

  // Timeouts (seconds)
  OVERALL_TIMEOUT_SEC: z.coerce.number().int().positive().default(30),
  COMPILE_TIMEOUT_SEC: z.coerce.number().int().positive().default(60),
  TEST_CASE_TIMEOUT_SEC: z.coerce.number().int().positive().default(5),

  // Zip limits
  MAX_ZIP_SIZE_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024), // 10MB
  MAX_UNCOMPRESSED_SIZE_BYTES: z.coerce.number().int().positive().default(50 * 1024 * 1024), // 50MB
  MAX_ZIP_FILES: z.coerce.number().int().positive().default(200),
  MAX_DIR_DEPTH: z.coerce.number().int().positive().default(10),

  // Output limits
  MAX_OUTPUT_BYTES: z.coerce.number().int().positive().default(64 * 1024), // 64KB

  // Logging
  LOG_DIR: z.string().default('./logs'),
  LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

  // Docker images
  JAVA_IMAGE: z.string().default('aita-sandbox-java17:latest'),
  DOTNET_IMAGE: z.string().default('aita-sandbox-dotnet8:latest')
});

export type Config = z.infer<typeof configSchema>;

export const config = configSchema.parse({
  HOST: process.env.HOST,
  PORT: process.env.PORT,
  INTERNAL_TOKEN: process.env.INTERNAL_TOKEN || 'aita_internal_secret_key_2026',
  CORE_API_URL: process.env.CORE_API_URL,
  CORE_API_KEY: process.env.CORE_API_KEY,
  MAX_CONCURRENT_CONTAINERS: process.env.MAX_CONCURRENT_CONTAINERS,
  MAX_QUEUE_SIZE: process.env.MAX_QUEUE_SIZE,
  SANDBOX_MEMORY_MB: process.env.SANDBOX_MEMORY_MB,
  SANDBOX_CPUS: process.env.SANDBOX_CPUS,
  SANDBOX_PIDS_LIMIT: process.env.SANDBOX_PIDS_LIMIT,
  SANDBOX_TMPFS_SIZE_MB: process.env.SANDBOX_TMPFS_SIZE_MB,
  OVERALL_TIMEOUT_SEC: process.env.OVERALL_TIMEOUT_SEC,
  COMPILE_TIMEOUT_SEC: process.env.COMPILE_TIMEOUT_SEC,
  TEST_CASE_TIMEOUT_SEC: process.env.TEST_CASE_TIMEOUT_SEC,
  MAX_ZIP_SIZE_BYTES: process.env.MAX_ZIP_SIZE_BYTES,
  MAX_UNCOMPRESSED_SIZE_BYTES: process.env.MAX_UNCOMPRESSED_SIZE_BYTES,
  MAX_ZIP_FILES: process.env.MAX_ZIP_FILES,
  MAX_DIR_DEPTH: process.env.MAX_DIR_DEPTH,
  MAX_OUTPUT_BYTES: process.env.MAX_OUTPUT_BYTES,
  LOG_DIR: process.env.LOG_DIR,
  LOG_RETENTION_DAYS: process.env.LOG_RETENTION_DAYS,
  JAVA_IMAGE: process.env.JAVA_IMAGE,
  DOTNET_IMAGE: process.env.DOTNET_IMAGE
});
