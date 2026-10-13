import { config } from "../config.js";

export interface UrlValidationResult {
  isValid: boolean;
  owner?: string;
  repo?: string;
  sanitizedUrl?: string;
  error?: string;
}

/**
 * Strict Git URL Validator for untrusted user input.
 *
 * Security rules:
 * - HTTPS protocol only (no http, file, ssh, git, ftp)
 * - Host must be present in allowlist (default: github.com)
 * - No user credentials / userinfo in URL (user:pass@)
 * - No command injection / option injection patterns (--upload-pack, --, newlines, spaces, null bytes)
 * - Must strictly match owner/repo pattern
 */
export function validateRepoUrl(
  inputUrl: string,
  allowlist: string[] = config.GIT_HOST_ALLOWLIST,
): UrlValidationResult {
  if (!inputUrl || typeof inputUrl !== "string") {
    return { isValid: false, error: "Repository URL is required and must be a string." };
  }

  const trimmed = inputUrl.trim();

  // Reject options injection or malicious character sequences
  if (
    trimmed.startsWith("-") ||
    trimmed.includes("\0") ||
    trimmed.includes("\n") ||
    trimmed.includes("\r") ||
    trimmed.includes(" ") ||
    trimmed.includes("--upload-pack") ||
    trimmed.includes(";") ||
    trimmed.includes("|") ||
    trimmed.includes("&") ||
    trimmed.includes("`") ||
    trimmed.includes("$")
  ) {
    return {
      isValid: false,
      error: "Malformed URL: contains forbidden characters or option flags.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { isValid: false, error: `Invalid URL format: "${trimmed}"` };
  }

  // 1. Protocol check: HTTPS only
  if (parsed.protocol !== "https:") {
    return {
      isValid: false,
      error: `Forbidden protocol "${parsed.protocol}". Only "https:" is allowed.`,
    };
  }

  // 2. No user credentials
  if (parsed.username || parsed.password) {
    return {
      isValid: false,
      error: "URLs with embedded credentials (username/password) are forbidden.",
    };
  }

  // 3. Host allowlist check
  const host = parsed.hostname.toLowerCase();
  const isAllowedHost = allowlist.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );

  if (!isAllowedHost) {
    return {
      isValid: false,
      error: `Host "${host}" is not in the allowed git hosts list (${allowlist.join(", ")}).`,
    };
  }

  // 4. Path structure check: must be /owner/repo (or /owner/repo.git)
  const pathParts = parsed.pathname
    .split("/")
    .filter((p) => p.length > 0);

  if (pathParts.length !== 2) {
    return {
      isValid: false,
      error: `Invalid repository path. Expected "/owner/repo", got "${parsed.pathname}".`,
    };
  }

  const owner = pathParts[0];
  const rawRepo = pathParts[1];
  const repo = rawRepo.endsWith(".git") ? rawRepo.slice(0, -4) : rawRepo;

  // Validate owner and repo names (alphanumeric, hyphens, underscores, dots)
  const namePattern = /^[a-zA-Z0-9_.-]+$/;
  if (!namePattern.test(owner) || !namePattern.test(repo)) {
    return {
      isValid: false,
      error: "Owner or repository name contains invalid characters.",
    };
  }

  if (owner.startsWith("-") || repo.startsWith("-") || repo === "." || repo === "..") {
    return {
      isValid: false,
      error: "Invalid repository naming structure.",
    };
  }

  const sanitizedUrl = `https://${host}/${owner}/${repo}.git`;

  return {
    isValid: true,
    owner,
    repo,
    sanitizedUrl,
  };
}
