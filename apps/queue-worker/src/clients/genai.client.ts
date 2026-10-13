import axios, { type AxiosInstance, AxiosError } from "axios";
import { config } from "../config.js";
import { logger } from "../logger.js";
import type {
  IGenAiClient,
  GenAiReviewRequest,
  GenAiReviewResponse,
} from "../contracts/genai.contract.js";
import { GenAiUnavailableError } from "../worker/error-classifier.js";

/**
 * Module 3 (GenAI Gateway - Huy) client.
 * Calls GenAI Gateway for clean code review (0-100 score + Vietnamese feedback)
 * and compilation error explanation (NFR-17).
 */
export class GenAiClient implements IGenAiClient {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: config.GENAI_GATEWAY_URL,
      timeout: config.GENAI_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": config.INTERNAL_API_KEY,
      },
    });
  }

  async review(request: GenAiReviewRequest): Promise<GenAiReviewResponse> {
    try {
      logger.info(
        {
          submissionId: request.submissionId,
          language: request.language,
          isCompilationError: request.isCompilationError,
        },
        "Calling GenAI Gateway...",
      );

      const response = await this.http.post<GenAiReviewResponse>(
        "/api/review",
        request,
      );

      logger.info(
        {
          submissionId: request.submissionId,
          cleanCodeScore: response.data.cleanCodeScore,
        },
        "GenAI Gateway review completed",
      );

      return response.data;
    } catch (err) {
      if (err instanceof AxiosError) {
        logger.warn(
          {
            submissionId: request.submissionId,
            status: err.response?.status,
            error: err.message,
          },
          "GenAI Gateway request failed",
        );
        throw new GenAiUnavailableError(
          `GenAI Gateway unavailable (${err.response?.status ?? "NETWORK_ERROR"}): ${err.message}`,
          err,
        );
      }
      throw new GenAiUnavailableError(
        `GenAI Gateway unexpected error: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }
}
