import axios from "axios";
import { logger } from "../logger.js";
import type {
  GitAnalyticsResult,
  MemberStats,
} from "../contracts/git-analytics.contract.js";

/**
 * Git Analytics Service (US-11).
 *
 * Lightweight service that parses commit counts and LOC per team member
 * from a public GitHub repository URL.
 *
 * Uses the GitHub REST API (no auth required for public repos, but rate-limited
 * to 60 req/hour). Falls back to mock data if offline or unauthenticated.
 */

// GitHub REST API response shapes (only the fields we need)
interface GitHubCommitItem {
  sha: string;
  commit: {
    author: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
  };
}

interface GitHubCommitStats {
  stats?: {
    additions: number;
    deletions: number;
  };
}

/**
 * Parse owner and repo from a GitHub URL.
 * Supports formats:
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo.git
 * - github.com/owner/repo
 */
function parseGitHubUrl(repoUrl: string): { owner: string; repo: string } {
  const cleaned = repoUrl.replace(/\.git$/, "").replace(/\/$/, "");

  const match = cleaned.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+)/,
  );

  if (!match || !match[1] || !match[2]) {
    throw new Error(
      `Invalid GitHub URL: "${repoUrl}". Expected format: https://github.com/owner/repo`,
    );
  }

  return { owner: match[1], repo: match[2] };
}

/**
 * Fetch all commits from a GitHub repository (paginated, max ~500).
 */
async function fetchCommits(
  owner: string,
  repo: string,
): Promise<GitHubCommitItem[]> {
  const allCommits: GitHubCommitItem[] = [];
  let page = 1;
  const perPage = 100;
  const maxPages = 5; // Cap at ~500 commits for performance

  while (page <= maxPages) {
    const response = await axios.get<GitHubCommitItem[]>(
      `https://api.github.com/repos/${owner}/${repo}/commits`,
      {
        params: { page, per_page: perPage },
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "AITA-Queue-Worker/0.1",
        },
        timeout: 15_000,
      },
    );

    if (response.data.length === 0) break;
    allCommits.push(...response.data);

    if (response.data.length < perPage) break;
    page++;
  }

  return allCommits;
}

/**
 * Fetch detailed stats (additions/deletions) for a single commit.
 */
async function fetchCommitStats(
  owner: string,
  repo: string,
  sha: string,
): Promise<{ additions: number; deletions: number }> {
  try {
    const response = await axios.get<GitHubCommitStats>(
      `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "AITA-Queue-Worker/0.1",
        },
        timeout: 10_000,
      },
    );
    return {
      additions: response.data.stats?.additions ?? 0,
      deletions: response.data.stats?.deletions ?? 0,
    };
  } catch {
    return { additions: 0, deletions: 0 };
  }
}

/**
 * Generate mock data for offline/testing scenarios.
 */
function generateMockData(repoUrl: string): GitAnalyticsResult {
  const { owner, repo } = parseGitHubUrl(repoUrl);

  return {
    repository: `${owner}/${repo}`,
    totalCommits: 47,
    memberStats: [
      { author: "An Nguyen", commits: 15, additions: 1200, deletions: 340 },
      { author: "Thien Tran", commits: 12, additions: 980, deletions: 220 },
      { author: "Nhat Le", commits: 10, additions: 750, deletions: 180 },
      { author: "Huy Pham", commits: 10, additions: 650, deletions: 150 },
    ],
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Analyze a GitHub repository for commit counts and LOC per team member.
 *
 * Falls back to mock data if the GitHub API is unreachable.
 *
 * @param repoUrl - GitHub repository URL (e.g. https://github.com/owner/repo)
 * @param options - Optional settings
 */
export async function analyzeRepository(
  repoUrl: string,
  options?: { forceMock?: boolean; sampleSize?: number },
): Promise<GitAnalyticsResult> {
  const { owner, repo } = parseGitHubUrl(repoUrl);

  if (options?.forceMock) {
    logger.info({ repoUrl }, "[MOCK] Returning mock git analytics data");
    return generateMockData(repoUrl);
  }

  try {
    logger.info({ owner, repo }, "Fetching commits from GitHub API");

    const commits = await fetchCommits(owner, repo);

    // Aggregate commits per author
    const authorMap = new Map<
      string,
      { commits: number; additions: number; deletions: number }
    >();

    for (const commit of commits) {
      const authorName = commit.commit.author.name;
      const existing = authorMap.get(authorName) ?? {
        commits: 0,
        additions: 0,
        deletions: 0,
      };
      existing.commits += 1;
      authorMap.set(authorName, existing);
    }

    // Fetch detailed stats for a sample of commits (to avoid rate limiting)
    const sampleSize = options?.sampleSize ?? 20;
    const sampled = commits.slice(0, sampleSize);

    for (const commit of sampled) {
      const stats = await fetchCommitStats(owner, repo, commit.sha);
      const authorName = commit.commit.author.name;
      const existing = authorMap.get(authorName);
      if (existing) {
        existing.additions += stats.additions;
        existing.deletions += stats.deletions;
      }
    }

    const memberStats: MemberStats[] = Array.from(authorMap.entries())
      .map(([author, stats]) => ({
        author,
        commits: stats.commits,
        additions: stats.additions,
        deletions: stats.deletions,
      }))
      .sort((a, b) => b.commits - a.commits);

    const result: GitAnalyticsResult = {
      repository: `${owner}/${repo}`,
      totalCommits: commits.length,
      memberStats,
      analyzedAt: new Date().toISOString(),
    };

    logger.info(
      {
        repository: result.repository,
        totalCommits: result.totalCommits,
        members: result.memberStats.length,
      },
      "Git analytics complete",
    );

    return result;
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err), repoUrl },
      "GitHub API unavailable — falling back to mock data",
    );
    return generateMockData(repoUrl);
  }
}
