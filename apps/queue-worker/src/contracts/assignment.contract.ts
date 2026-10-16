import { z } from "zod";
import type { AssignmentDeadlineStatus } from "./status.contract.js";

/**
 * Assignment Contracts for Module 5
 * Covers Task 3 (Deadline enforcement & classification) and Task 5 (Existing assignment query & class filtering).
 */

export const AssignmentItemSchema = z.object({
  id: z.string().min(1),
  classId: z.string().min(1),
  classCode: z.string().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  language: z.string().min(1),
  deadline: z.string(),
  deadlineStatus: z.enum(["ACTIVE", "ENDED"]).optional(),
  gradingCriteria: z.string().nullable().optional(),
  testCasesCount: z.number().int().nonnegative().default(0),
  submissionsCount: z.number().int().nonnegative().default(0),
  createdAt: z.string().optional(),
});

export type AssignmentItem = z.infer<typeof AssignmentItemSchema>;

/**
 * Filter query for querying assignments (Task 5)
 * Supports filtering by lecturer and one or more class IDs.
 */
export interface AssignmentFilterQuery {
  lecturerId?: string;
  classId?: string;
  classIds?: string[];
  status?: "ACTIVE" | "ENDED" | "ALL";
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Response for assignment list query (Task 5)
 */
export interface AssignmentQueryResponse {
  success: boolean;
  data: AssignmentItem[];
  total: number;
}

/**
 * Detail response for a single assignment
 */
export interface AssignmentDetailResponse {
  success: boolean;
  data: AssignmentItem & {
    testCases?: Array<{
      id?: string;
      inputData?: string;
      expectedOutput?: string;
      scoreWeight?: number;
    }>;
  };
}

/**
 * Request & response for verifying assignment deadline (Task 3)
 */
export interface DeadlineCheckRequest {
  assignmentId: string;
  submittedAt?: string;
}

export interface DeadlineCheckResponse {
  assignmentId: string;
  deadline: string;
  isPastDeadline: boolean;
  deadlineStatus: AssignmentDeadlineStatus;
}

/**
 * Overdue sweep request & response (Task 3: N/A marking for unsubmitted students)
 */
export interface OverdueSweepRequest {
  assignmentId: string;
}

export interface OverdueSweepResponse {
  assignmentId: string;
  markedCount: number;
  studentIds: string[];
  status: "NOT_SUBMITTED";
}
