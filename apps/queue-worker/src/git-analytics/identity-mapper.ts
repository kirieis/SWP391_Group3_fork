import type {
  TeamMember,
  MemberContributionStats,
  UnmappedAuthorStats,
} from "../contracts/git-analytics.contract.js";
import type { ParsedCommit } from "./log-parser.js";

export interface IdentityMappingResult {
  memberStats: MemberContributionStats[];
  unmapped: UnmappedAuthorStats[];
  totals: {
    commits: number;
    additions: number;
    deletions: number;
    netLoc: number;
  };
}

/**
 * Pure function: maps commits to team members based on emails, usernames, and noreply aliases.
 */
export function mapCommitsToMembers(
  commits: ParsedCommit[],
  members: TeamMember[],
): IdentityMappingResult {
  // Initialize accumulator for each member
  const memberAccumulators = new Map<
    string,
    {
      studentId: string;
      name: string;
      commits: number;
      additions: number;
      deletions: number;
    }
  >();

  for (const m of members) {
    memberAccumulators.set(m.studentId, {
      studentId: m.studentId,
      name: m.name,
      commits: 0,
      additions: 0,
      deletions: 0,
    });
  }

  const unmappedMap = new Map<string, UnmappedAuthorStats>();

  let totalCommits = 0;
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const commit of commits) {
    totalCommits++;
    totalAdditions += commit.totalAdditions;
    totalDeletions += commit.totalDeletions;

    const matchedMember = findMatchingMember(commit, members);

    if (matchedMember) {
      const acc = memberAccumulators.get(matchedMember.studentId)!;
      acc.commits++;
      acc.additions += commit.totalAdditions;
      acc.deletions += commit.totalDeletions;
    } else {
      const key = `${commit.authorName} <${commit.authorEmail}>`;
      const existing = unmappedMap.get(key);
      if (existing) {
        existing.commits++;
        existing.additions += commit.totalAdditions;
        existing.deletions += commit.totalDeletions;
      } else {
        unmappedMap.set(key, {
          author: commit.authorName,
          email: commit.authorEmail,
          commits: 1,
          additions: commit.totalAdditions,
          deletions: commit.totalDeletions,
        });
      }
    }
  }

  const memberStats: MemberContributionStats[] = members.map((m) => {
    const acc = memberAccumulators.get(m.studentId)!;
    return {
      studentId: m.studentId,
      name: m.name,
      commits: acc.commits,
      additions: acc.additions,
      deletions: acc.deletions,
      net: acc.additions - acc.deletions,
      sharePercent: 0, // Computed in contribution step
      isFreeRider: false, // Computed in contribution step
    };
  });

  return {
    memberStats,
    unmapped: Array.from(unmappedMap.values()),
    totals: {
      commits: totalCommits,
      additions: totalAdditions,
      deletions: totalDeletions,
      netLoc: totalAdditions - totalDeletions,
    },
  };
}

/**
 * Match a commit's author against a list of members.
 */
export function findMatchingMember(
  commit: { authorName: string; authorEmail: string },
  members: TeamMember[],
): TeamMember | undefined {
  const commitEmail = commit.authorEmail.toLowerCase().trim();
  const commitName = commit.authorName.toLowerCase().trim();

  // Extract GitHub noreply username if applicable
  // Format: 12345+username@users.noreply.github.com OR username@users.noreply.github.com
  let noreplyUsername: string | undefined;
  if (commitEmail.includes("users.noreply.github.com")) {
    const atSplit = commitEmail.split("@")[0];
    const plusSplit = atSplit.split("+");
    noreplyUsername = (plusSplit.length > 1 ? plusSplit[1] : plusSplit[0]).toLowerCase();
  }

  for (const member of members) {
    // 1. Direct email match
    const hasEmailMatch = member.emails.some(
      (e) => e.toLowerCase().trim() === commitEmail,
    );
    if (hasEmailMatch) return member;

    // 2. Noreply username match
    if (noreplyUsername) {
      const hasNoreplyMatch = member.githubUsernames.some(
        (u) => u.toLowerCase().trim() === noreplyUsername,
      );
      if (hasNoreplyMatch) return member;
    }

    // 3. Username match with commit author name or email prefix
    const hasUsernameMatch = member.githubUsernames.some((u) => {
      const normalizedU = u.toLowerCase().trim();
      return (
        commitName === normalizedU ||
        commitEmail.startsWith(`${normalizedU}@`)
      );
    });
    if (hasUsernameMatch) return member;

    // 4. Exact full name match (case-insensitive)
    if (member.name.toLowerCase().trim() === commitName) {
      return member;
    }
  }

  return undefined;
}
