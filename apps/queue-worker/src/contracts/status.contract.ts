/**
 * Centralized status contracts for Milestone 3.
 * Single source of truth for submission statuses, stepper steps, and git analytics states.
 */

/**
 * Submission statuses in database / Module 1.
 * [ASSUMPTION]: "AI_REVIEW_PENDING" is introduced for Milestone 3 when GenAI gateway is unreachable,
 * allowing sandbox + AST results to be stored without failing the entire grading.
 */
export const SUBMISSION_STATUSES = [
  "PENDING",
  "QUEUED",
  "RUNNING_TESTS",
  "GRADED",
  "COMPILATION_ERROR",
  "TIMEOUT",
  "SECURITY_VIOLATION",
  "AI_REVIEW_PENDING", // [ASSUMPTION: Milestone 3 addition pending An's DB schema confirmation]
  "DEADLINE_EXCEEDED", // Task 3: Submission rejected because deadline has passed
  "NOT_SUBMITTED",     // Task 3: Default N/A status for students with no submission past deadline
] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/**
 * Assignment deadline categorization for lecturer dashboard (Task 3)
 */
export const ASSIGNMENT_DEADLINE_STATUSES = ["ACTIVE", "ENDED"] as const;
export type AssignmentDeadlineStatus = (typeof ASSIGNMENT_DEADLINE_STATUSES)[number];

/**
 * Classify whether an assignment is ACTIVE (not yet expired) or ENDED (past deadline).
 */
export function classifyAssignmentDeadline(
  deadline: string | Date,
  referenceDate: Date = new Date(),
): AssignmentDeadlineStatus {
  const d = new Date(deadline);
  if (isNaN(d.getTime())) {
    return "ACTIVE";
  }
  return d.getTime() < referenceDate.getTime() ? "ENDED" : "ACTIVE";
}


/**
 * 6 UI Stepper Steps (owned by An - Module 1).
 */
export const GRADING_STEPS = [
  "QUEUED",
  "BUILDING",
  "RUNNING_TESTS",
  "AST_ANALYSIS",
  "AI_REVIEW",
  "COMPLETE",
] as const;

export type GradingStep = (typeof GRADING_STEPS)[number];

/**
 * Git Analytics State Machine states (SRS 6.4.3).
 * Transitions:
 * CLONING -> PARSING_COMMITS -> CALCULATING_LOC -> EVALUATING -> COMPLETED | FREE_RIDER_DETECTED
 * Terminal failure: FAILED [ASSUMPTION: with reason code]
 */
export const GIT_ANALYSIS_STATUSES = [
  "CLONING",
  "PARSING_COMMITS",
  "CALCULATING_LOC",
  "EVALUATING",
  "COMPLETED",
  "FREE_RIDER_DETECTED",
  "FAILED",
] as const;

export type GitAnalysisStatus = (typeof GIT_ANALYSIS_STATUSES)[number];

/**
 * Reason codes for Git analysis failure (non-crashing, understandable to lecturer).
 */
export type GitAnalysisFailureReason =
  | "INVALID_URL"
  | "REPO_NOT_FOUND_OR_NO_ACCESS"
  | "EMPTY_REPO"
  | "REPO_TOO_LARGE"
  | "TIMEOUT"
  | "SYSTEM_ERROR";
