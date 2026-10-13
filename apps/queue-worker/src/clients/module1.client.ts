import axios, { type AxiosInstance } from "axios";
import { config } from "../config.js";
import { logger } from "../logger.js";
import type {
  Module1CallbackBody,
  Module1CallbackResponse,
} from "../contracts/module1.contract.js";
import type { GitAnalysisCallbackBody } from "../contracts/git-analytics.contract.js";

/**
 * Module 1 (API Gateway) client.
 * Wraps PATCH /api/submissions/:submissionId/result with auth header.
 * Also wraps PATCH /api/git-analysis/:analysisId/status [ASSUMPTION].
 */
export class Module1Client {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: config.API_GATEWAY_URL,
      timeout: 10_000,
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": config.INTERNAL_API_KEY,
      },
    });
  }

  /**
   * Report grading progress/result back to the API Gateway.
   * On infrastructure errors (5xx, network), throws so BullMQ retries.
   */
  async updateSubmissionResult(
    submissionId: string,
    body: Module1CallbackBody,
  ): Promise<Module1CallbackResponse> {
    const url = `/api/submissions/${submissionId}/result`;

    logger.info(
      {
        submissionId,
        status: body.status,
        step: body.step,
        progressPercent: body.progressPercent,
      },
      `Callback Module 1: ${body.step} (${body.progressPercent}%)`,
    );

    const response = await this.http.patch<Module1CallbackResponse>(url, body);
    return response.data;
  }

  /**
   * Report Git Analytics progress/status back to API Gateway.
   * [ASSUMPTION]: Endpoint PATCH /api/git-analysis/:analysisId/result
   */
  async updateGitAnalysisResult(
    analysisId: string,
    body: GitAnalysisCallbackBody,
  ): Promise<Module1CallbackResponse> {
    const url = `/api/git-analysis/${analysisId}/result`;

    logger.info(
      {
        analysisId,
        status: body.status,
        progressPercent: body.progressPercent,
      },
      `Callback Module 1 (Git Analysis): ${body.status} (${body.progressPercent}%)`,
    );

    const response = await this.http.patch<Module1CallbackResponse>(url, body);
    return response.data;
  }
}
