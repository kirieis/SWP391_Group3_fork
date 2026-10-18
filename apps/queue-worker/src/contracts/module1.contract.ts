import type { SubmissionStatus, GradingStep, AssignmentDeadlineStatus } from "./status.contract.js";
import type { SandboxTestCaseResult } from "./sandbox.contract.js";
export * from "./assignment.contract.js";

export type { SubmissionStatus, GradingStep, AssignmentDeadlineStatus };

/**
 * Module 1 (API Gateway) callback contract.
 * Endpoint: PATCH /api/submissions/:submissionId/result
 * Auth: Header `x-internal-key: <INTERNAL_API_KEY>`
 */

/**
 * Body sent to PATCH /api/submissions/:submissionId/result
 */
export interface Module1CallbackBody {
  status: SubmissionStatus;
  step: GradingStep;
  progressPercent: number;
  message: string;
  /** Only sent on final GRADED/terminal status */
  totalScore?: number;
  /** Results per sandbox test case, persisted for the grading page. */
  testResults?: SandboxTestCaseResult[];
  /** GenAI review feedback (Milestone 3) */
  aiFeedback?: string;
  aiCleanCodeScore?: number;
  aiReviewPending?: boolean;
  compileErrorExplanation?: string;
  /** AST plagiarism summary */
  astSimilarityPercent?: number;
  plagiarismFlag?: boolean;
}

/**
 * Response shape from Module 1 callback endpoint.
 */
export interface Module1CallbackResponse {
  success: boolean;
  message: string;
  data?: unknown;
}
