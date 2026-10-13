/**
 * Module 3 (GenAI Gateway - Huy) contract.
 * [ASSUMPTION]: Exact endpoint and payload schema awaiting final confirmation from Huy.
 * Gateway performs its own multi-provider fallback within its internal time cap.
 */

export interface GenAiReviewRequest {
  submissionId: string;
  language: string;
  fileRelativePath?: string;
  sourceCode?: string;
  /** Summary of sandbox outcome (not full raw stdout dump) */
  sandboxSummary?: {
    outcome: string;
    passedTests: number;
    totalTests: number;
    executionTimeMs: number;
  };
  /** If compilation error, ask GenAI for Vietnamese explanation (NFR-17) */
  isCompilationError?: boolean;
  compileOutput?: string;
}

export interface GenAiReviewResponse {
  /** Clean code quality score (0 to 100) */
  cleanCodeScore: number;
  /** Detailed feedback in Vietnamese */
  feedback: string;
  /** Vietnamese explanation of compilation error if applicable (NFR-17) */
  compilationExplanation?: string;
}

/**
 * Interface for GenAI client — implemented by both GenAiClient and MockGenAiClient.
 */
export interface IGenAiClient {
  review(request: GenAiReviewRequest): Promise<GenAiReviewResponse>;
}
