import type { GitAnalysisStatus } from "../contracts/status.contract.js";

export type GitAnalysisEvent =
  | "CLONE_SUCCESS"
  | "PARSE_SUCCESS"
  | "CALCULATE_SUCCESS"
  | "EVALUATION_CLEAN"
  | "FREE_RIDER_FOUND"
  | "FAIL";

const VALID_TRANSITIONS: Record<
  GitAnalysisStatus,
  Partial<Record<GitAnalysisEvent, GitAnalysisStatus>>
> = {
  CLONING: {
    CLONE_SUCCESS: "PARSING_COMMITS",
    FAIL: "FAILED",
  },
  PARSING_COMMITS: {
    PARSE_SUCCESS: "CALCULATING_LOC",
    FAIL: "FAILED",
  },
  CALCULATING_LOC: {
    CALCULATE_SUCCESS: "EVALUATING",
    FAIL: "FAILED",
  },
  EVALUATING: {
    EVALUATION_CLEAN: "COMPLETED",
    FREE_RIDER_FOUND: "FREE_RIDER_DETECTED",
    FAIL: "FAILED",
  },
  COMPLETED: {},
  FREE_RIDER_DETECTED: {},
  FAILED: {},
};

/**
 * Pure State Machine for Git Analytics (SRS 6.4.3).
 * Throws on illegal state transitions.
 */
export function transition(
  currentState: GitAnalysisStatus,
  event: GitAnalysisEvent,
): GitAnalysisStatus {
  const allowed = VALID_TRANSITIONS[currentState];
  const nextState = allowed ? allowed[event] : undefined;

  if (!nextState) {
    throw new Error(
      `Invalid Git Analysis state transition: cannot handle event "${event}" in state "${currentState}".`,
    );
  }

  return nextState;
}

/**
 * Helper to check if a state is terminal.
 */
export function isTerminalState(state: GitAnalysisStatus): boolean {
  return state === "COMPLETED" || state === "FREE_RIDER_DETECTED" || state === "FAILED";
}
