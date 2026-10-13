import { config } from '../config';

export interface TruncatedOutput {
  content: string;
  truncated: boolean;
}

/**
 * Truncate output string if it exceeds maxBytes (default 64KB).
 */
export function truncateOutput(text: string, maxBytes = config.MAX_OUTPUT_BYTES): TruncatedOutput {
  if (!text) {
    return { content: '', truncated: false };
  }

  const buffer = Buffer.from(text, 'utf-8');
  if (buffer.length <= maxBytes) {
    return { content: text, truncated: false };
  }

  // Truncate cleanly at byte boundary
  const truncatedBuffer = buffer.subarray(0, maxBytes);
  // Ensure valid UTF-8 string even if truncated mid-codepoint
  return {
    content: truncatedBuffer.toString('utf-8'),
    truncated: true
  };
}

/**
 * Sanitize error message and compile output:
 * - Remove host filesystem paths (/home/*, /root/*, /Users/*)
 * - Remove container IDs (64 or 12 hex chars)
 * - Remove system hostnames, raw stack traces exposing host internals
 */
export function sanitizeOutput(text: string): string {
  if (!text) return '';

  let sanitized = text;

  // Mask host home directory paths e.g. /home/username/... -> /sandbox/...
  sanitized = sanitized.replace(/\/home\/[a-zA-Z0-9._-]+\b/g, '/sandbox');
  sanitized = sanitized.replace(/\/root\b/g, '/sandbox');
  sanitized = sanitized.replace(/\/Users\/[a-zA-Z0-9._-]+\b/g, '/sandbox');

  // Mask full Docker container IDs (64 hex characters)
  sanitized = sanitized.replace(/\b[0-9a-f]{64}\b/gi, '[CONTAINER_ID]');
  // Mask 12-16 hex character IDs when appearing in container contexts
  sanitized = sanitized.replace(/(container\s+)([0-9a-f]{12,16})\b/gi, '$1[CONTAINER_ID]');

  // Normalize /tmp/sandbox-build-* or host temp paths to /workspace/
  sanitized = sanitized.replace(/\/tmp\/[a-zA-Z0-9._-]+\/workspace\b/g, '/workspace');

  return sanitized;
}
