import { logger } from "../../logger.js";
import type {
  Module1CallbackBody,
  Module1CallbackResponse,
} from "../../contracts/module1.contract.js";
import type { GitAnalysisCallbackBody } from "../../contracts/git-analytics.contract.js";
import type {
  ISandboxClient,
  SandboxRequest,
  SandboxResponse,
  SandboxOutcome,
} from "../../contracts/sandbox.contract.js";
import type {
  IAstClient,
  AstAnalysisRequest,
  AstAnalysisResponse,
} from "../../contracts/ast.contract.js";
import type {
  IGenAiClient,
  GenAiReviewRequest,
  GenAiReviewResponse,
} from "../../contracts/genai.contract.js";
import { GenAiUnavailableError } from "../../worker/error-classifier.js";

// ─── Mock Module 1 Client ────────────────────────────────────────────────────

export class MockModule1Client {
  public readonly callLog: Array<{
    submissionId: string;
    body: Module1CallbackBody;
  }> = [];

  public readonly gitCallLog: Array<{
    analysisId: string;
    body: GitAnalysisCallbackBody;
  }> = [];

  async updateSubmissionResult(
    submissionId: string,
    body: Module1CallbackBody,
  ): Promise<Module1CallbackResponse> {
    this.callLog.push({ submissionId, body });

    logger.info(
      {
        submissionId,
        status: body.status,
        step: body.step,
        progressPercent: body.progressPercent,
      },
      `[MOCK] Module 1 callback: ${body.step} (${body.progressPercent}%)`,
    );

    return { success: true, message: "[MOCK] Result updated" };
  }

  async updateGitAnalysisResult(
    analysisId: string,
    body: GitAnalysisCallbackBody,
  ): Promise<Module1CallbackResponse> {
    this.gitCallLog.push({ analysisId, body });

    logger.info(
      {
        analysisId,
        status: body.status,
        progressPercent: body.progressPercent,
      },
      `[MOCK] Module 1 Git Analysis callback: ${body.status} (${body.progressPercent}%)`,
    );

    return { success: true, message: "[MOCK] Git analysis result updated" };
  }
}

// ─── Mock Sandbox Client ─────────────────────────────────────────────────────

export class MockSandboxClient implements ISandboxClient {
  public executionCount = 0;

  async execute(request: SandboxRequest): Promise<SandboxResponse> {
    this.executionCount++;
    const filePath = request.fileRelativePath.toLowerCase();

    let outcome: SandboxOutcome = "PASSED";
    let passedTests = 10;
    const totalTests = 10;
    let executionTimeMs = 1250;
    let errorMessage: string | undefined;

    if (filePath.includes("timeout")) {
      outcome = "TIMEOUT";
      passedTests = 0;
      executionTimeMs = 30_000;
      errorMessage = "Execution exceeded time limit (30s)";
    } else if (filePath.includes("security_violation")) {
      outcome = "SECURITY_VIOLATION";
      passedTests = 0;
      executionTimeMs = 150;
      errorMessage = "Forbidden system call detected: Runtime.exec()";
    } else if (filePath.includes("compilation_error")) {
      outcome = "COMPILATION_ERROR";
      passedTests = 0;
      executionTimeMs = 80;
      errorMessage =
        "error: incompatible types: String cannot be converted to int";
    }

    logger.info(
      { submissionId: request.submissionId, outcome, executionCount: this.executionCount },
      `[MOCK] Sandbox result: ${outcome}`,
    );

    return {
      outcome,
      passedTests,
      totalTests,
      executionTimeMs,
      output: outcome === "PASSED" ? "All tests passed" : undefined,
      errorMessage,
    };
  }
}

// ─── Mock AST Client ─────────────────────────────────────────────────────────

export class MockAstClient implements IAstClient {
  public shouldFail = false;

  async analyze(request: AstAnalysisRequest): Promise<AstAnalysisResponse> {
    if (this.shouldFail) {
      throw new Error("AST service connection refused");
    }

    const filePath = request.fileRelativePath.toLowerCase();

    if (filePath.includes("ast_error")) {
      throw new Error("AST service timeout (504)");
    }

    const isFlagged = filePath.includes("plagiarism");
    const similarityPercent = isFlagged ? 75 : 12.5;
    const message = isFlagged
      ? "High structural similarity detected with existing submissions"
      : "No significant similarity detected";

    logger.info(
      { submissionId: request.submissionId, similarityPercent },
      `[MOCK] AST result: ${similarityPercent}% similarity`,
    );

    return {
      similarityPercent,
      message,
      syntaxError: false,
    };
  }
}

// ─── Mock GenAI Client (Milestone 3) ─────────────────────────────────────────

export class MockGenAiClient implements IGenAiClient {
  public simulateOutage = false;
  public simulateSlow = false;
  public callCount = 0;

  async review(request: GenAiReviewRequest): Promise<GenAiReviewResponse> {
    this.callCount++;
    const path = (request.fileRelativePath ?? "").toLowerCase();
    const subId = request.submissionId.toLowerCase();

    if (this.simulateSlow) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (
      this.simulateOutage ||
      path.includes("genai_outage") ||
      path.includes("genai_error") ||
      subId.includes("genai_outage")
    ) {
      logger.warn(
        { submissionId: request.submissionId },
        "[MOCK] GenAI simulating total gateway outage (503)",
      );
      throw new GenAiUnavailableError(
        "GenAI Gateway outage: all providers failed or rate-limited",
      );
    }

    if (request.isCompilationError) {
      return {
        cleanCodeScore: 0,
        feedback: "Chương trình không biên dịch được.",
        compilationExplanation:
          "Lỗi biên dịch: Không thể gán giá trị kiểu String cho biến int tại dòng 15. Hãy kiểm tra ép kiểu hoặc giá trị truyền vào.",
      };
    }

    return {
      cleanCodeScore: 88,
      feedback:
        "Code cấu trúc rõ ràng, đặt tên biến chuẩn camelCase. Cần lưu ý xử lý null check trước khi gọi method.",
    };
  }
}
