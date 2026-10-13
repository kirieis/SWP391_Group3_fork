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
        feedback: "Tốt lắm",
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
});
