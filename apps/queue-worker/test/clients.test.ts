import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAxiosInstance, MockAxiosError } = vi.hoisted(() => {
  class MockAxiosError extends Error {
    public response?: { status?: number };
    public isAxiosError = true;
    constructor(msg: string) {
      super(msg);
      this.name = "AxiosError";
    }
  }

  const mockAxiosInstance = {
    patch: vi.fn(),
    post: vi.fn(),
    get: vi.fn(),
  };

  return { mockAxiosInstance, MockAxiosError };
});

// Mock axios
vi.mock("axios", () => {
  return {
    default: {
      create: vi.fn().mockReturnValue(mockAxiosInstance),
      patch: vi.fn(),
      post: vi.fn(),
      get: vi.fn(),
      AxiosError: MockAxiosError,
      isAxiosError: (err: unknown): boolean =>
        err instanceof MockAxiosError ||
        Boolean(
          err &&
            typeof err === "object" &&
            "isAxiosError" in err &&
            (err as { isAxiosError: unknown }).isAxiosError === true,
        ),
    },
    AxiosError: MockAxiosError,
    isAxiosError: (err: unknown): boolean =>
      err instanceof MockAxiosError ||
      Boolean(
        err &&
          typeof err === "object" &&
          "isAxiosError" in err &&
          (err as { isAxiosError: unknown }).isAxiosError === true,
      ),
  };
});

// Mock config
vi.mock("../src/config.js", () => ({
  config: {
    API_GATEWAY_URL: "http://localhost:5000",
    INTERNAL_API_KEY: "secret-key",
    GENAI_GATEWAY_URL: "http://localhost:5002",
    GENAI_TIMEOUT_MS: 30000,
    USE_MOCKS: false,
    LOG_LEVEL: "silent",
  },
}));

// Mock logger
vi.mock("../src/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { Module1Client } = await import("../src/clients/module1.client.js");
const { GenAiClient } = await import("../src/clients/genai.client.js");
const { GenAiUnavailableError } = await import("../src/worker/error-classifier.js");

describe("HTTP Clients (Module1 & GenAI)", () => {
  let mockHttp: typeof mockAxiosInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHttp = mockAxiosInstance;
  });

  it("Module1Client should send patch to /api/submissions/:id/result", async () => {
    mockHttp.patch.mockResolvedValue({
      data: { success: true, message: "Updated" },
    });

    const client = new Module1Client();
    const res = await client.updateSubmissionResult("sub-123", {
      status: "GRADED",
      step: "COMPLETE",
      progressPercent: 100,
      message: "Done",
      totalScore: 10,
    });

    expect(mockHttp.patch).toHaveBeenCalledWith(
      "/api/submissions/sub-123/result",
      expect.objectContaining({ status: "GRADED" }),
    );
    expect(res.success).toBe(true);
  });

  it("Module1Client should send patch to /api/git-analysis/:id/result", async () => {
    mockHttp.patch.mockResolvedValue({
      data: { success: true, message: "Git analysis updated" },
    });

    const client = new Module1Client();
    const res = await client.updateGitAnalysisResult("analysis-123", {
      status: "COMPLETED",
      progressPercent: 100,
      message: "Completed",
    });

    expect(mockHttp.patch).toHaveBeenCalledWith(
      "/api/git-analysis/analysis-123/result",
      expect.objectContaining({ status: "COMPLETED" }),
    );
    expect(res.success).toBe(true);
  });

  it("GenAiClient should post to /api/review and return data", async () => {
    mockHttp.post.mockResolvedValue({
      data: {
        cleanCodeScore: 92,
        feedback: "Great job",
      },
    });


    const client = new GenAiClient();
    const res = await client.review({
      submissionId: "sub-1",
      language: "java",
    });

    expect(mockHttp.post).toHaveBeenCalledWith(
      "/api/review",
      expect.objectContaining({ submissionId: "sub-1" }),
    );
    expect(res.cleanCodeScore).toBe(92);
  });

  it("GenAiClient should throw GenAiUnavailableError on failure", async () => {
    const err = new MockAxiosError("Request timeout");
    err.response = { status: 504 };
    mockHttp.post.mockRejectedValue(err);

    const client = new GenAiClient();
    await expect(
      client.review({ submissionId: "sub-1", language: "java" }),
    ).rejects.toThrow(GenAiUnavailableError);
  });

  it("AstClient should post to /api/internal/submissions/:id/ast-check on Gateway", async () => {
    const { AstClient } = await import("../src/clients/ast.client.js");
    mockHttp.post.mockResolvedValue({
      data: {
        success: true,
        status: "DONE",
        similarityPercent: 95.5,
        isPlagiarism: true,
        matchedPairs: 1,
      },
    });

    const client = new AstClient();
    const res = await client.analyze({
      submissionId: "sub-999",
      assignmentId: "assign-1",
      language: "java",
      fileRelativePath: "uploads/sub.zip",
    });

    expect(mockHttp.post).toHaveBeenCalledWith(
      "/api/internal/submissions/sub-999/ast-check",
      expect.objectContaining({ submissionId: "sub-999" }),
    );
    expect(res.isPlagiarism).toBe(true);
    expect(res.similarityPercent).toBe(95.5);
  });

  it("Module1Client should verify deadline correctly", async () => {
    mockHttp.get.mockResolvedValueOnce({
      data: {
        assignmentId: "asg-1",
        deadline: "2026-10-20T00:00:00.000Z",
        isPastDeadline: false,
        deadlineStatus: "ACTIVE",
      },
    });

    const client = new Module1Client();
    const res = await client.checkDeadline("asg-1", "2026-10-15T00:00:00.000Z");

    expect(mockHttp.get).toHaveBeenCalledWith(
      "/api/assignments/asg-1/deadline-check",
      expect.objectContaining({ params: { submittedAt: "2026-10-15T00:00:00.000Z" } }),
    );
    expect(res.isPastDeadline).toBe(false);
    expect(res.deadlineStatus).toBe("ACTIVE");
  });

  it("Module1Client checkDeadline should use fallback when deadline-check endpoint fails", async () => {
    mockHttp.get.mockRejectedValueOnce(new Error("404 endpoint not found"));
    mockHttp.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          id: "asg-fallback",
          deadline: "2026-10-10T00:00:00.000Z",
        },
      },
    });

    const client = new Module1Client();
    const res = await client.checkDeadline("asg-fallback", "2026-10-15T00:00:00.000Z");

    expect(res.isPastDeadline).toBe(true);
    expect(res.deadlineStatus).toBe("ENDED");
  });


  it("Module1Client should query assignments with classIds filter", async () => {
    mockHttp.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: [{ id: "asg-1", classId: "c-1", title: "Test 1" }],
        total: 1,
      },
    });

    const client = new Module1Client();
    const res = await client.getAssignments({
      classIds: ["c-1", "c-2"],
      status: "ACTIVE",
    });

    expect(mockHttp.get).toHaveBeenCalledWith(
      "/api/assignments",
      expect.objectContaining({ params: { classIds: "c-1,c-2", status: "ACTIVE" } }),
    );
    expect(res.data.length).toBe(1);
  });

  it("MockModule1Client should correctly filter assignments and check deadlines", async () => {
    const { MockModule1Client } = await import("../src/clients/mocks/index.js");
    const mock = new MockModule1Client();

    // Check active
    const check1 = await mock.checkDeadline("asg-active-1");
    expect(check1.isPastDeadline).toBe(false);
    expect(check1.deadlineStatus).toBe("ACTIVE");

    // Check expired
    const check2 = await mock.checkDeadline("asg-expired-1");
    expect(check2.isPastDeadline).toBe(true);
    expect(check2.deadlineStatus).toBe("ENDED");

    // Query filter by classId
    const resClass = await mock.getAssignments({ classId: "class-101" });
    expect(resClass.data.every((a) => a.classId === "class-101")).toBe(true);

    // Query filter by multiple classIds
    const resMulti = await mock.getAssignments({ classIds: ["class-101", "class-102"] });
    expect(resMulti.data.length).toBe(3);

    // Sweep unsubmitted
    const sweep = await mock.markOverdueSubmissions("asg-expired-1");
    expect(sweep.status).toBe("NOT_SUBMITTED");
    expect(sweep.markedCount).toBe(3);
  });
});

