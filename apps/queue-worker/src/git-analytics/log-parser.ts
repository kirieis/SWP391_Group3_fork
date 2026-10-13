import { shouldIgnoreFile } from "./ignore-rules.js";

export interface FileStat {
  filePath: string;
  additions: number;
  deletions: number;
  isBinary: boolean;
  isIgnored: boolean;
}

export interface ParsedCommit {
  sha: string;
  authorName: string;
  authorEmail: string;
  date: string;
  subject: string;
  files: FileStat[];
  totalAdditions: number;
  totalDeletions: number;
}

/**
 * Pure function: parses raw git log string into typed ParsedCommit records.
 * Delimiter format: RECORD_SEP + UNIT_SEP (\x1f) separated commit header fields,
 * followed by numstat tab-separated lines.
 */
export function parseGitLog(rawOutput: string): ParsedCommit[] {
  if (!rawOutput || rawOutput.trim().length === 0) {
    return [];
  }

  // Split by RECORD_SEP marker
  const rawEntries = rawOutput.split("RECORD_SEP").filter((e) => e.trim().length > 0);
  const commits: ParsedCommit[] = [];

  for (const entry of rawEntries) {
    const lines = entry.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) continue;

    const headerLine = lines[0];
    const headerParts = headerLine.split("\x1f");

    if (headerParts.length < 5) {
      continue;
    }

    const sha = headerParts[1]?.trim() ?? "";
    const authorName = headerParts[2]?.trim() ?? "";
    const authorEmail = headerParts[3]?.trim().toLowerCase() ?? "";
    const date = headerParts[4]?.trim() ?? "";
    const subject = headerParts[5]?.trim() ?? "";

    const files: FileStat[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;

    // Remaining lines are numstat lines
    for (let i = 1; i < lines.length; i++) {
      const numstatLine = lines[i];
      const match = numstatLine.match(/^([0-9-]+)\t([0-9-]+)\t(.+)$/);
      if (!match) continue;

      const rawAdd = match[1];
      const rawDel = match[2];
      const rawPath = match[3];

      const isBinary = rawAdd === "-" && rawDel === "-";
      const additions = isBinary ? 0 : parseInt(rawAdd, 10) || 0;
      const deletions = isBinary ? 0 : parseInt(rawDel, 10) || 0;

      // Handle git rename syntax {old => new}/path or old => new
      const cleanedPath = cleanRenamePath(rawPath);
      const isIgnored = shouldIgnoreFile(cleanedPath);

      files.push({
        filePath: cleanedPath,
        additions,
        deletions,
        isBinary,
        isIgnored,
      });

      if (!isIgnored) {
        totalAdditions += additions;
        totalDeletions += deletions;
      }
    }

    commits.push({
      sha,
      authorName,
      authorEmail,
      date,
      subject,
      files,
      totalAdditions,
      totalDeletions,
    });
  }

  return commits;
}

/**
 * Normalize git rename syntax in file paths:
 * E.g. "src/{old => new}/index.ts" -> "src/new/index.ts"
 * E.g. "old.ts => new.ts" -> "new.ts"
 */
export function cleanRenamePath(filePath: string): string {
  let cleaned = filePath;

  if (cleaned.includes(" => ")) {
    // Check if bracketed rename {old => new}
    const bracketMatch = cleaned.match(/^(.*?)\{(?:.*?)\s*=>\s*(.*?)\}(.*?)$/);
    if (bracketMatch) {
      cleaned = `${bracketMatch[1]}${bracketMatch[2]}${bracketMatch[3]}`;
    } else {
      const parts = cleaned.split(" => ");
      cleaned = parts[parts.length - 1].trim();
    }
  }

  // Normalize duplicate slashes
  return cleaned.replace(/\/+/g, "/").trim();
}
