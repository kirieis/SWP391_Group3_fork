/**
 * Module 4 (AST Plagiarism Engine) & Gateway AST Integration contract.
 * Per ADR-001 & phan_hoi_chot_phan_he_1.md (A1-A6, B1, B4):
 * - AST Engine runs at port 8000 (AST_ENGINE_URL).
 * - Worker triggers AST check via Module 1 internal endpoint:
 *   POST /api/internal/submissions/:submissionId/ast-check (with header x-internal-key).
 * - Thresholds decided by engine:
 *   SAFE (< 30%), WARNING (30% - 60%, exactly 60% is still WARNING), DANGER (> 60% -> isPlagiarism: true).
 * - Syntax errors fallback to lex mode with status NEEDS_REVIEW (not skipped).
 */

/** Similarity danger threshold — strictly greater than 60% (> 60) is DANGER per A4 */
export const AST_SIMILARITY_DANGER_THRESHOLD = 60;

export interface AstAnalysisRequest {
  submissionId: string;
  assignmentId: string;
  language: string;
  fileRelativePath: string;
}

export type AstCheckStatus = "DONE" | "NEEDS_REVIEW" | "FAILED";

export type PlagiarismStatus =
  | "CLEAN"
  | "SUSPICIOUS"
  | "NEEDS_REVIEW"
  | "FAILED"
  | "SKIPPED";

export interface AstAnalysisResponse {
  /** Whether the AST check completed without fatal error */
  success?: boolean;
  /** Gateway ast_check_status mapping (B1): DONE | NEEDS_REVIEW | FAILED */
  status?: AstCheckStatus;
  /** Highest similarity percentage with sibling submissions (0-100) */
  similarityPercent: number;
  /** True if at least one pair is DANGER (flag = PLAGIARISM_DETECTED) per A4 & B4 */
  isPlagiarism?: boolean;
  /** Number of matched submission pairs */
  matchedPairs?: number;
  /** Human-readable summary message */
  message: string;
  /** Legacy flag for syntax errors */
  syntaxError?: boolean;
  /** Optional list of matched submissions */
  matchedSubmissions?: Array<{
    submissionId: string;
    similarityPercent: number;
  }>;
}

/**
 * Client interface for AST Check — both real and mock implement this.
 */
export interface IAstClient {
  analyze(request: AstAnalysisRequest): Promise<AstAnalysisResponse>;
}
