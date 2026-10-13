import { z } from "zod";
import type {
  GitAnalysisStatus,
  GitAnalysisFailureReason,
} from "./status.contract.js";

/**
 * Team member definition passed in the git-analysis job payload.
 */
export const TeamMemberSchema = z.object({
  studentId: z.string().min(1),
  name: z.string().min(1),
  emails: z.array(z.string().email().or(z.string())),
  githubUsernames: z.array(z.string()).default([]),
});

export type TeamMember = z.infer<typeof TeamMemberSchema>;

/**
 * BullMQ Job Payload for `git-analysis` queue.
 * [ASSUMPTION]: Schema pending final confirmation from An.
 */
export const GitAnalysisJobPayloadSchema = z.object({
  analysisId: z.string().min(1),
  projectId: z.string().min(1),
  repoUrl: z.string().min(1),
  branch: z.string().optional(),
  members: z.array(TeamMemberSchema).min(1),
  requestedBy: z.string().min(1),
});

export type GitAnalysisJobPayload = z.infer<typeof GitAnalysisJobPayloadSchema>;

/**
 * Per-member contribution statistics.
 */
export interface MemberContributionStats {
  studentId: string;
  name: string;
  commits: number;
  additions: number;
  deletions: number;
  net: number;
  sharePercent: number;
  isFreeRider: boolean;
}

/**
 * Statistics for unmapped commit authors.
 */
export interface UnmappedAuthorStats {
  author: string;
  email: string;
  commits: number;
  additions: number;
  deletions: number;
}

/**
 * Full Git Analytics Result sent to Module 1.
 */
export interface GitAnalysisResult {
  analysisId: string;
  projectId: string;
  repository: string;
  repoUrl: string;
  status: GitAnalysisStatus;
  failureReason?: GitAnalysisFailureReason;
  failureMessage?: string;
  totals: {
    commits: number;
    additions: number;
    deletions: number;
    netLoc: number;
  };
  memberStats: MemberContributionStats[];
  unmapped: UnmappedAuthorStats[];
  lowActivity: boolean;
  commitRange?: {
    firstCommitSha?: string;
    lastCommitSha?: string;
    totalCommits: number;
  };
  analyzedAt: string;
}

/**
 * Callback body for updating git analysis progress/status in Module 1.
 * [ASSUMPTION]: Callback endpoint PATCH /api/git-analysis/:analysisId/status or similar.
 */
export interface GitAnalysisCallbackBody {
  status: GitAnalysisStatus;
  progressPercent: number;
  message: string;
  result?: GitAnalysisResult;
}

/**
 * Backward-compatible types for Milestone 2 git-analytics.service.ts
 */
export interface MemberStats {
  author: string;
  commits: number;
  additions: number;
  deletions: number;
}

export interface GitAnalyticsResult {
  repository: string;
  totalCommits: number;
  memberStats: MemberStats[];
  analyzedAt: string;
}
