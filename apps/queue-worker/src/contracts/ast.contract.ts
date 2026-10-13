/**
 * Module 4 (AST Plagiarism Engine) contract.
 * Service URL: http://localhost:8000
 * Endpoint: POST /analyze
 *
 * Thresholds per CLAUDE.md:
 * - Warning  >= 30%
 * - Danger   >= 60% (PLAGIARISM_DETECTED)
 *
 * Non-blocking: If AST service is down or code has syntax errors,
 * report SKIPPED and never fail the whole job.
 */

/** Similarity threshold — above this the submission is flagged as suspicious */
export const AST_SIMILARITY_DANGER_THRESHOLD = 60;

export interface AstAnalysisRequest {
  submissionId: string;
  assignmentId: string;
  language: string;
  fileRelativePath: string;
}

export type PlagiarismStatus = "CLEAN" | "SUSPICIOUS" | "SKIPPED";

export interface AstAnalysisResponse {
  /** Percentage similarity with existing submissions (0-100) */
  similarityPercent: number;
  /** Human-readable summary from AST engine */
  message: string;
  /** Whether syntax errors were encountered */
  syntaxError?: boolean;
  /** Optional list of matched submissions */
  matchedSubmissions?: Array<{
    submissionId: string;
    similarityPercent: number;
  }>;
}

/**
 * Client interface for AST Engine — both real and mock implement this.
 */
export interface IAstClient {
  analyze(request: AstAnalysisRequest): Promise<AstAnalysisResponse>;
}
