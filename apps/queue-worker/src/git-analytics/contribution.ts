import type { MemberContributionStats } from "../contracts/git-analytics.contract.js";
import { config } from "../config.js";

export interface ContributionOptions {
  commitWeight?: number;
  locWeight?: number;
  freeRiderThresholdPercent?: number;
}

export interface ContributionEvaluationResult {
  memberStats: MemberContributionStats[];
  hasFreeRiders: boolean;
  lowActivity: boolean;
}

/**
 * Pure function: calculates contribution share percentage and flags free-riders.
 * Default weights: 50% commit count + 50% LOC activity (additions + deletions).
 * [ASSUMPTION]: Exact weights and formula awaiting final lecturer/SRS confirmation.
 */
export function computeContributionShare(
  memberStats: MemberContributionStats[],
  totals: {
    commits: number;
    additions: number;
    deletions: number;
  },
  options: ContributionOptions = {},
): ContributionEvaluationResult {
  const commitWeight = options.commitWeight ?? config.CONTRIBUTION_COMMIT_WEIGHT;
  const locWeight = options.locWeight ?? config.CONTRIBUTION_LOC_WEIGHT;
  const threshold =
    options.freeRiderThresholdPercent ?? config.FREE_RIDER_THRESHOLD_PERCENT;

  const totalCommits = totals.commits;
  const totalLoc = totals.additions + totals.deletions;

  // Edge case 1: Empty repo or zero commits
  if (totalCommits === 0) {
    return {
      memberStats: memberStats.map((m) => ({
        ...m,
        sharePercent: memberStats.length > 0 ? Math.round(100 / memberStats.length) : 0,
        isFreeRider: false,
      })),
      hasFreeRiders: false,
      lowActivity: true,
    };
  }

  // Edge case 2: Single member team
  if (memberStats.length === 1) {
    const single = memberStats[0];
    return {
      memberStats: [
        {
          ...single,
          sharePercent: 100,
          isFreeRider: false,
        },
      ],
      hasFreeRiders: false,
      lowActivity: totalCommits < 5,
    };
  }

  const isLowActivity = totalCommits < 5;
  let hasFreeRiders = false;

  const evaluatedMembers: MemberContributionStats[] = memberStats.map((member) => {
    const memberLoc = member.additions + member.deletions;

    const commitShare = totalCommits > 0 ? member.commits / totalCommits : 0;
    const locShare = totalLoc > 0 ? memberLoc / totalLoc : 0;

    const rawShare =
      totalLoc > 0
        ? commitWeight * commitShare + locWeight * locShare
        : commitShare;

    const sharePercent = Math.round(rawShare * 1000) / 10; // 1 decimal place (e.g. 4.8)

    // Free-rider rule:
    // If a member has 0 commits or their overall share is strictly less than threshold
    // Do NOT flag if whole project has very low activity (< 3 commits)
    const isFreeRider =
      !isLowActivity && (member.commits === 0 || sharePercent < threshold);

    if (isFreeRider) {
      hasFreeRiders = true;
    }

    return {
      ...member,
      sharePercent,
      isFreeRider,
    };
  });

  return {
    memberStats: evaluatedMembers,
    hasFreeRiders,
    lowActivity: isLowActivity,
  };
}
