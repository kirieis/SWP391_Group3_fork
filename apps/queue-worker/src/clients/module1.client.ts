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

  /**
   * Verify if a submission is within deadline (Task 3).
   * Checks with Module 1 API or queries assignment deadline.
   */
  async checkDeadline(
    assignmentId: string,
    submittedAt?: string,
  ): Promise<import("../contracts/assignment.contract.js").DeadlineCheckResponse> {
    const url = `/api/assignments/${assignmentId}/deadline-check`;
    try {
      const response = await this.http.get<import("../contracts/assignment.contract.js").DeadlineCheckResponse>(
        url,
        { params: { submittedAt } },
      );
      return response.data;
    } catch {
      // Fallback: fetch assignment directly and compute deadline status
      const assignmentRes = await this.getAssignment(assignmentId);
      const deadline = assignmentRes.data.deadline;
      const subTime = submittedAt ? new Date(submittedAt).getTime() : Date.now();
      const deadTime = new Date(deadline).getTime();
      const isPastDeadline = !isNaN(subTime) && !isNaN(deadTime) && subTime > deadTime;
      return {
        assignmentId,
        deadline,
        isPastDeadline,
        deadlineStatus: isPastDeadline ? "ENDED" : "ACTIVE",
      };
    }
  }

  /**
   * Query created assignments, with optional classIds filtering (Task 5).
   * Allows lecturer to view and select existing assignments.
   */
  async getAssignments(
    filter?: import("../contracts/assignment.contract.js").AssignmentFilterQuery,
  ): Promise<import("../contracts/assignment.contract.js").AssignmentQueryResponse> {
    const url = "/api/assignments";
    const params: Record<string, string | number | undefined> = {};

    if (filter?.classId) params.classId = filter.classId;
    if (filter?.classIds && filter.classIds.length > 0) {
      params.classIds = filter.classIds.join(",");
    }
    if (filter?.status) params.status = filter.status;
    if (filter?.lecturerId) params.lecturerId = filter.lecturerId;
    if (filter?.search) params.search = filter.search;

    const response = await this.http.get<import("../contracts/assignment.contract.js").AssignmentQueryResponse>(
      url,
      { params },
    );
    return response.data;
  }

  /**
   * Get single assignment details by ID.
   */
  async getAssignment(
    assignmentId: string,
  ): Promise<import("../contracts/assignment.contract.js").AssignmentDetailResponse> {
    const url = `/api/assignments/${assignmentId}`;
    const response = await this.http.get<import("../contracts/assignment.contract.js").AssignmentDetailResponse>(url);
    return response.data;
  }

  /**
   * Mark all unsubmitted students for an expired assignment as NOT_SUBMITTED (N/A) (Task 3).
   */
  async markOverdueSubmissions(
    assignmentId: string,
  ): Promise<import("../contracts/assignment.contract.js").OverdueSweepResponse> {
    const url = `/api/assignments/${assignmentId}/mark-overdue`;
    const response = await this.http.post<import("../contracts/assignment.contract.js").OverdueSweepResponse>(url);
    return response.data;
  }
}

