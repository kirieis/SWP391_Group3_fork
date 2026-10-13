import { describe, it, expect } from "vitest";
import { validateRepoUrl } from "../src/git-analytics/url-validator.js";
import { parseGitLog, cleanRenamePath } from "../src/git-analytics/log-parser.js";
import { shouldIgnoreFile } from "../src/git-analytics/ignore-rules.js";
import {
  mapCommitsToMembers,
  findMatchingMember,
} from "../src/git-analytics/identity-mapper.js";
import { computeContributionShare } from "../src/git-analytics/contribution.js";
import { transition, isTerminalState } from "../src/git-analytics/state-machine.js";
import type { TeamMember } from "../src/contracts/git-analytics.contract.js";

describe("Git Analytics Unit Tests (US-11)", () => {
  // ── 1. URL Validator ───────────────────────────────────────────────────────
  describe("URL Validator Security Rules", () => {
    it("should accept valid HTTPS GitHub URLs", () => {
      const valid = [
        "https://github.com/organization/project",
        "https://github.com/organization/project.git",
        "https://github.com/john-doe/repo_123",
      ];
      for (const url of valid) {
        const res = validateRepoUrl(url);
        expect(res.isValid).toBe(true);
        expect(res.sanitizedUrl).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+\.git$/);
      }
    });

    it("should reject malicious and disallowed URLs (12 attack patterns)", () => {
      const maliciousCases = [
        // 1. Option flag injection
        "--upload-pack=echo pwned",
        "-oProxyCommand=calc.exe",
        // 2. Local file protocol
        "file:///etc/passwd",
        // 3. SSH protocol
        "ssh://git@github.com/org/repo.git",
        "git@github.com:org/repo.git",
        // 4. Insecure HTTP
        "http://github.com/org/repo",
        // 5. Embedded credentials
        "https://user:password@github.com/org/repo",
        // 6. Host not in allowlist
        "https://gitlab.com/org/repo",
        "https://evil-hacker.com/org/repo",
        // 7. Path traversal / directory escape
        "https://github.com/org/../repo",
        // 8. Spaces or newlines
        "https://github.com/org/repo\n--upload-pack",
        "https://github.com/org/repo extra-arg",
        // 9. Null byte injection
        "https://github.com/org/repo\0.git",
        // 10. Shell metacharacters
        "https://github.com/org/repo;rm -rf /",
        "https://github.com/org/repo|cat",
      ];

      for (const malicious of maliciousCases) {
        const res = validateRepoUrl(malicious);
        expect(res.isValid).toBe(false);
        expect(res.error).toBeDefined();
      }
    });
  });

  // ── 2. Ignore Rules ────────────────────────────────────────────────────────
  describe("Ignore Rules for LOC calculation", () => {
    it("should ignore lockfiles, vendor directories, minified files, and binary assets", () => {
      expect(shouldIgnoreFile("package-lock.json")).toBe(true);
      expect(shouldIgnoreFile("yarn.lock")).toBe(true);
      expect(shouldIgnoreFile("pnpm-lock.yaml")).toBe(true);
      expect(shouldIgnoreFile("node_modules/express/index.js")).toBe(true);
      expect(shouldIgnoreFile("dist/bundle.js")).toBe(true);
      expect(shouldIgnoreFile("build/output.js")).toBe(true);
      expect(shouldIgnoreFile("app.min.js")).toBe(true);
      expect(shouldIgnoreFile("bundle.js.map")).toBe(true);
      expect(shouldIgnoreFile("logo.png")).toBe(true);
      expect(shouldIgnoreFile("video.mp4")).toBe(true);
      expect(shouldIgnoreFile(".idea/workspace.xml")).toBe(true);
    });

    it("should NOT ignore legitimate source files", () => {
      expect(shouldIgnoreFile("src/index.ts")).toBe(false);
      expect(shouldIgnoreFile("src/components/App.vue")).toBe(false);
      expect(shouldIgnoreFile("Main.java")).toBe(false);
      expect(shouldIgnoreFile("go.mod")).toBe(false);
    });
  });

  // ── 3. Log Parser ──────────────────────────────────────────────────────────
  describe("Log Parser", () => {
    it("should parse machine-formatted git log output", () => {
      const rawLog = `RECORD_SEP\x1fsha001\x1fAlice\x1falice@example.com\x1f2026-10-10T10:00:00Z\x1fInitial commit
10\t2\tsrc/app.ts
-\t-\tassets/logo.png
RECORD_SEP\x1fsha002\x1fBob\x1fbob@example.com\x1f2026-10-11T12:00:00Z\x1fRefactor code
5\t3\tsrc/{old => new}/app.ts
500\t10\tpackage-lock.json`;

      const commits = parseGitLog(rawLog);
      expect(commits).toHaveLength(2);

      // Commit 1
      expect(commits[0].sha).toBe("sha001");
      expect(commits[0].authorName).toBe("Alice");
      expect(commits[0].totalAdditions).toBe(10);
      expect(commits[0].totalDeletions).toBe(2);
      expect(commits[0].files[1].isBinary).toBe(true);

      // Commit 2 (package-lock.json is ignored from total additions/deletions)
      expect(commits[1].sha).toBe("sha002");
      expect(commits[1].totalAdditions).toBe(5); // Only 5 from src/new/app.ts, package-lock excluded
      expect(commits[1].totalDeletions).toBe(3);
    });

    it("should handle cleanRenamePath", () => {
      expect(cleanRenamePath("src/{old => new}/app.ts")).toBe("src/new/app.ts");
      expect(cleanRenamePath("old.ts => new.ts")).toBe("new.ts");
      expect(cleanRenamePath("regular/path.ts")).toBe("regular/path.ts");
    });
  });

  // ── 4. Identity Mapper ─────────────────────────────────────────────────────
  describe("Identity Mapper", () => {
    const members: TeamMember[] = [
      {
        studentId: "SE16001",
        name: "Nguyen Van A",
        emails: ["anv@fpt.edu.vn", "personal_a@gmail.com"],
        githubUsernames: ["nva_coder"],
      },
      {
        studentId: "SE16002",
        name: "Tran Thi B",
        emails: ["btt@fpt.edu.vn"],
        githubUsernames: ["tranb"],
      },
    ];

    it("should match by email, username, or noreply email alias", () => {
      // 1. Exact email match
      expect(
        findMatchingMember(
          { authorName: "Alex", authorEmail: "personal_a@gmail.com" },
          members,
        )?.studentId,
      ).toBe("SE16001");

      // 2. Noreply GitHub email match
      expect(
        findMatchingMember(
          {
            authorName: "Someone",
            authorEmail: "12345+tranb@users.noreply.github.com",
          },
          members,
        )?.studentId,
      ).toBe("SE16002");

      // 3. Username match
      expect(
        findMatchingMember(
          { authorName: "nva_coder", authorEmail: "random@nowhere.com" },
          members,
        )?.studentId,
      ).toBe("SE16001");
    });

    it("should map commits to members and collect unmapped authors", () => {
      const commits = [
        {
          sha: "1",
          authorName: "Nguyen Van A",
          authorEmail: "anv@fpt.edu.vn",
          date: "",
          subject: "",
          files: [],
          totalAdditions: 100,
          totalDeletions: 20,
        },
        {
          sha: "2",
          authorName: "Ghost",
          authorEmail: "ghost@unknown.com",
          date: "",
          subject: "",
          files: [],
          totalAdditions: 10,
          totalDeletions: 5,
        },
      ];

      const mapped = mapCommitsToMembers(commits, members);

      expect(mapped.memberStats[0].commits).toBe(1);
      expect(mapped.memberStats[0].additions).toBe(100);
      expect(mapped.memberStats[1].commits).toBe(0);
      expect(mapped.unmapped).toHaveLength(1);
      expect(mapped.unmapped[0].email).toBe("ghost@unknown.com");
    });
  });

  // ── 5. Contribution & Free-Rider Detection ─────────────────────────────────
  describe("Contribution & Free-Rider Logic", () => {
    it("should calculate balanced contribution and flag free-riders (< 5%)", () => {
      const stats = [
        {
          studentId: "S1",
          name: "Active Member 1",
          commits: 50,
          additions: 500,
          deletions: 50,
          net: 450,
          sharePercent: 0,
          isFreeRider: false,
        },
        {
          studentId: "S2",
          name: "Active Member 2",
          commits: 48,
          additions: 450,
          deletions: 50,
          net: 400,
          sharePercent: 0,
          isFreeRider: false,
        },
        {
          studentId: "S3",
          name: "Free Rider",
          commits: 1,
          additions: 5,
          deletions: 0,
          net: 5,
          sharePercent: 0,
          isFreeRider: false,
        },
      ];

      const totals = {
        commits: 99,
        additions: 955,
        deletions: 100,
      };

      const result = computeContributionShare(stats, totals, {
        freeRiderThresholdPercent: 5,
      });

      expect(result.hasFreeRiders).toBe(true);
      const freeRider = result.memberStats.find((m) => m.studentId === "S3")!;
      expect(freeRider.isFreeRider).toBe(true);
      expect(freeRider.sharePercent).toBeLessThan(5);

      const active1 = result.memberStats.find((m) => m.studentId === "S1")!;
      expect(active1.isFreeRider).toBe(false);
      expect(active1.sharePercent).toBeGreaterThan(40);
    });

    it("should handle single member team without flagging free-rider", () => {
      const stats = [
        {
          studentId: "SOLO",
          name: "Solo Developer",
          commits: 10,
          additions: 200,
          deletions: 20,
          net: 180,
          sharePercent: 0,
          isFreeRider: false,
        },
      ];

      const result = computeContributionShare(
        stats,
        { commits: 10, additions: 200, deletions: 20 },
      );

      expect(result.hasFreeRiders).toBe(false);
      expect(result.memberStats[0].sharePercent).toBe(100);
      expect(result.memberStats[0].isFreeRider).toBe(false);
    });

    it("should handle low activity project (< 5 commits) without flagging free-riders", () => {
      const stats = [
        {
          studentId: "S1",
          name: "User 1",
          commits: 2,
          additions: 10,
          deletions: 0,
          net: 10,
          sharePercent: 0,
          isFreeRider: false,
        },
        {
          studentId: "S2",
          name: "User 2",
          commits: 1,
          additions: 5,
          deletions: 0,
          net: 5,
          sharePercent: 0,
          isFreeRider: false,
        },
      ];

      const result = computeContributionShare(
        stats,
        { commits: 3, additions: 15, deletions: 0 },
      );

      expect(result.lowActivity).toBe(true);
      expect(result.hasFreeRiders).toBe(false);
    });
  });

  // ── 6. State Machine ───────────────────────────────────────────────────────
  describe("State Machine Transitions (SRS 6.4.3)", () => {
    it("should execute valid sequence to COMPLETED", () => {
      let state = transition("CLONING", "CLONE_SUCCESS");
      expect(state).toBe("PARSING_COMMITS");

      state = transition(state, "PARSE_SUCCESS");
      expect(state).toBe("CALCULATING_LOC");

      state = transition(state, "CALCULATE_SUCCESS");
      expect(state).toBe("EVALUATING");

      state = transition(state, "EVALUATION_CLEAN");
      expect(state).toBe("COMPLETED");
      expect(isTerminalState(state)).toBe(true);
    });

    it("should transition to FREE_RIDER_DETECTED when free riders exist", () => {
      const state = transition("EVALUATING", "FREE_RIDER_FOUND");
      expect(state).toBe("FREE_RIDER_DETECTED");
      expect(isTerminalState(state)).toBe(true);
    });

    it("should transition to FAILED from any active state", () => {
      expect(transition("CLONING", "FAIL")).toBe("FAILED");
      expect(transition("PARSING_COMMITS", "FAIL")).toBe("FAILED");
      expect(transition("CALCULATING_LOC", "FAIL")).toBe("FAILED");
      expect(transition("EVALUATING", "FAIL")).toBe("FAILED");
    });

    it("should reject illegal state transitions", () => {
      expect(() => transition("CLONING", "PARSE_SUCCESS")).toThrow(
        "Invalid Git Analysis state transition",
      );
      expect(() => transition("COMPLETED", "FAIL")).toThrow(
        "Invalid Git Analysis state transition",
      );
    });
  });
});
