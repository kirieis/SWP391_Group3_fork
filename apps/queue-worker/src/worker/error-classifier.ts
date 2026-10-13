import { AxiosError } from "axios";
import { UnrecoverableError } from "bullmq";

/**
 * Error Classification per CLAUDE.md Rule 4 and Milestone 3 specs:
 *
 * 1. Infrastructure Error (network, ECONNREFUSED, 5xx, 429)
 *    → Throw standard Error → BullMQ retries with exponential backoff
 *
 * 2. Validation Error (corrupt payload, 4xx other than 429)
 *    → UnrecoverableError → Do NOT retry, report failure to Module 1
 *
 * 3. GenAiUnavailableError (all providers down / gateway timeout / 429 exhaustion)
 *    → Non-fatal to grading! Handled by setting status to AI_REVIEW_PENDING
 *      and scheduling a delayed retry job (ai-review-retry).
 *
 * Business outcomes (TIMEOUT, SECURITY_VIOLATION, COMPILATION_ERROR) are
 * handled in the processor before reaching the error classifier.
 */

export class InfrastructureError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "InfrastructureError";
  }
}

export class ValidationError extends UnrecoverableError {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class GenAiUnavailableError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GenAiUnavailableError";
  }
}

/**
 * Classify an Axios error into infrastructure (retryable) or validation (unrecoverable).
 */
export function classifyAxiosError(error: AxiosError, context: string): never {
  const status = error.response?.status;

  // No response at all = network/connection issue → infrastructure
  if (!error.response) {
    throw new InfrastructureError(
      `${context}: Network error — ${error.message}`,
      error,
    );
  }

  // 429 Too Many Requests → infrastructure (should retry after backoff)
  if (status === 429) {
    throw new InfrastructureError(`${context}: Rate limited (429)`, error);
  }

  // 5xx Server Error → infrastructure
  if (status && status >= 500) {
    throw new InfrastructureError(
      `${context}: Server error (${status})`,
      error,
    );
  }

  // 4xx Client Error (excluding 429) → validation / unrecoverable
  throw new ValidationError(
    `${context}: Client error (${status}) — ${error.message}`,
  );
}

/**
 * Classify any unknown error — wraps non-Axios errors as infrastructure.
 */
export function classifyError(error: unknown, context: string): never {
  if (error instanceof UnrecoverableError) {
    throw error; // Already classified
  }

  if (error instanceof GenAiUnavailableError) {
    throw error; // GenAi specific error
  }

  if (error instanceof AxiosError) {
    classifyAxiosError(error, context);
  }

  // Unknown errors are treated as infrastructure (retryable)
  throw new InfrastructureError(
    `${context}: Unexpected error — ${error instanceof Error ? error.message : String(error)}`,
    error,
  );
}
