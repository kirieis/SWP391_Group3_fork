import axios, { type AxiosInstance } from "axios";
import { config } from "../config.js";
import { logger } from "../logger.js";
import type {
  IAstClient,
  AstAnalysisRequest,
  AstAnalysisResponse,
} from "../contracts/ast.contract.js";

/**
 * AST Plagiarism Check HTTP client (Contract A2, A3, B4).
 * Calls Module 1 Gateway internal endpoint:
 *   POST /api/internal/submissions/:submissionId/ast-check
 * Protected by `x-internal-key`. Gateway's `astService.check(submissionId)`
 * extracts the .zip, calls AST Engine (port 8000) `/analyze` & `/compare/batch`,
 * persists `AST_FINGERPRINTS` + `PLAGIARISM_MATCHES`, and sets `SCORE_WITHHELD` on DANGER.
 */
export class AstClient implements IAstClient {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: config.API_GATEWAY_URL,
      timeout: config.AST_TIMEOUT_MS, // Default 45s (> 10s analyze + 30s compare/batch per B4)
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": config.INTERNAL_API_KEY,
      },
    });
  }

  async analyze(request: AstAnalysisRequest): Promise<AstAnalysisResponse> {
    logger.info(
      { submissionId: request.submissionId },
      "Triggering AST Plagiarism Check via Gateway internal endpoint",
    );

    const response = await this.http.post<AstAnalysisResponse>(
      `/api/internal/submissions/${request.submissionId}/ast-check`,
      request,
    );

    const data = response.data;
    return {
      ...data,
      message:
        data.message ??
        (data.isPlagiarism
          ? `High structural similarity detected (${data.similarityPercent}%)`
          : data.status === "NEEDS_REVIEW"
            ? "AST check completed with warnings (needs manual review)"
            : "AST check completed: No plagiarism violation detected"),
    };
  }
}
