import { describe, it, expect } from "vitest";
import {
  SUBMISSION_STATUSES,
  GRADING_STEPS,
  GIT_ANALYSIS_STATUSES,
} from "../src/contracts/status.contract.js";
import { TERMINAL_OUTCOMES } from "../src/contracts/sandbox.contract.js";
import {
  SubmissionJobPayloadSchema,
} from "../src/contracts/job.contract.js";
import {
  GitAnalysisJobPayloadSchema,
  TeamMemberSchema,
} from "../src/contracts/git-analytics.contract.js";

describe("Contracts & Schemas Validation", () => {
  it("should have all expected status constants", () => {
    expect(SUBMISSION_STATUSES).toContain("AI_REVIEW_PENDING");
    expect(SUBMISSION_STATUSES).toContain("GRADED");
    expect(GRADING_STEPS).toContain("AI_REVIEW");
    expect(GIT_ANALYSIS_STATUSES).toContain("FREE_RIDER_DETECTED");
  });

  it("should correctly identify terminal sandbox outcomes", () => {
    expect(TERMINAL_OUTCOMES.has("TIMEOUT")).toBe(true);
    expect(TERMINAL_OUTCOMES.has("SECURITY_VIOLATION")).toBe(true);
    expect(TERMINAL_OUTCOMES.has("COMPILATION_ERROR")).toBe(true);
    expect(TERMINAL_OUTCOMES.has("PASSED")).toBe(false);
  });

  it("should validate SubmissionJobPayloadSchema defaults", () => {
    const parsed = SubmissionJobPayloadSchema.parse({
      submissionId: "sub-1",
      assignmentId: "assign-1",
      studentId: "stu-1",
      language: "java",
      fileRelativePath: "uploads/sub.zip",
      submittedAt: new Date().toISOString(),
    });

    expect(parsed.reason).toBe("INITIAL");
    expect(parsed.gradingRunNo).toBe(1);
  });

  it("should validate GitAnalysisJobPayloadSchema", () => {
    const member = TeamMemberSchema.parse({
      studentId: "STU01",
      name: "Student One",
      emails: ["one@swp391.edu.vn"],
      githubUsernames: ["stu_one"],
    });
    expect(member.studentId).toBe("STU01");

    const payload = GitAnalysisJobPayloadSchema.parse({
      analysisId: "a-1",
      projectId: "p-1",
      repoUrl: "https://github.com/org/repo",
      members: [member],
      requestedBy: "lecturer-1",
    });
    expect(payload.analysisId).toBe("a-1");
  });
});
