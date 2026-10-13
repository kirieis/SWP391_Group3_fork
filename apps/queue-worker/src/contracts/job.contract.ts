import { z } from "zod";
import type { SubmissionStatus } from "./status.contract.js";
import type { SandboxResponse } from "./sandbox.contract.js";
import type { AstAnalysisResponse, PlagiarismStatus } from "./ast.contract.js";
import type { GenAiReviewResponse } from "./genai.contract.js";

/**
 * Checkpoint state persisted into job data via job.updateData()
 * Allows retries to resume from the failing step without re-executing expensive earlier steps.
 */
export interface JobCheckpoint {
  sandbox?: SandboxResponse;
  ast?: AstAnalysisResponse | { skipped: true; reason: string };
  genai?: GenAiReviewResponse;
  aiReviewPending?: boolean;
}

/**
 * BullMQ Job Payload — validated at the start of every processor run.
 * Fields align with Module 1 (API Gateway).
 * [ASSUMPTION]: reason, gradingRunNo, batchId are Milestone 3 extensions pending An's confirmation.
 */
export const SubmissionJobPayloadSchema = z.object({
  submissionId: z.string().min(1, "submissionId is required"),
  assignmentId: z.string().min(1, "assignmentId is required"),
  studentId: z.string().min(1, "studentId is required"),
  language: z.string().min(1, "language is required"),
  fileRelativePath: z.string().min(1, "fileRelativePath is required"),
  submittedAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  // Milestone 3 additions [ASSUMPTION]
  reason: z.enum(["INITIAL", "REGRADE", "BATCH"]).default("INITIAL"),
  gradingRunNo: z.number().int().positive().default(1),
  batchId: z.string().optional(),
  // Checkpoint persisted across retry runs
  checkpoint: z
    .object({
      sandbox: z.any().optional(),
      ast: z.any().optional(),
      genai: z.any().optional(),
      aiReviewPending: z.boolean().optional(),
    })
    .optional(),
});

export type SubmissionJobPayload = z.infer<typeof SubmissionJobPayloadSchema>;
export type SubmissionJobInput = z.input<typeof SubmissionJobPayloadSchema>;

/**
 * Structured result returned from the BullMQ processor on job completion.
 */
export interface SubmissionJobResult {
  submissionId: string;
  assignmentId: string;
  studentId: string;
  finalStatus: SubmissionStatus;
  totalScore: number;
  reason?: "INITIAL" | "REGRADE" | "BATCH";
  gradingRunNo?: number;
  batchId?: string;
  /** Sandbox execution summary */
  sandbox: {
    outcome: string;
    passedTests: number;
    totalTests: number;
    executionTimeMs: number;
  };
  /** AST plagiarism summary */
  plagiarism: {
    status: PlagiarismStatus;
    similarityPercent: number;
    message: string;
  };
  /** GenAI review summary (Milestone 3) */
  genai?: {
    cleanCodeScore: number;
    feedback: string;
    compilationExplanation?: string;
    aiReviewPending: boolean;
  };
  /** ISO timestamp of when processing completed */
  completedAt: string;
}
