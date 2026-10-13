/**
 * Producer utility — convenience wrapper for external callers.
 * Re-exports enqueueSubmission, enqueueBatch, and getBatchProgress.
 */
export {
  enqueueSubmission,
  enqueueBatch,
  getBatchProgress,
} from "./submission.queue.js";
