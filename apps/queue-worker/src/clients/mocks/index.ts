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

  // Pre-configured mock assignments for Task 3 & Task 5 testing
  public mockAssignments: Array<import("../../contracts/assignment.contract.js").AssignmentItem> = [
    {
      id: "asg-active-1",
      classId: "class-101",
      classCode: "SE1801",
      title: "Java OOP Basics",
      description: "Implement OOP hierarchy and unit tests",
      language: "Java",
      deadline: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      deadlineStatus: "ACTIVE",
      testCasesCount: 5,
      submissionsCount: 12,
      createdAt: new Date().toISOString(),
    },
    {
      id: "asg-expired-1",
      classId: "class-101",
      classCode: "SE1801",
      title: "Data Structures - Linked List",
      description: "Singly and doubly linked lists implementation",
      language: "Java",
      deadline: new Date(Date.now() - 86400000).toISOString(), // Yesterday
      deadlineStatus: "ENDED",
      testCasesCount: 8,
      submissionsCount: 25,
      createdAt: new Date(Date.now() - 172800000).toISOString(),
    },
    {
      id: "asg-active-2",
      classId: "class-102",
      classCode: "SE1802",
      title: "Python Data Processing",
      description: "Parse CSV and compute aggregates",
      language: "Python",
      deadline: new Date(Date.now() + 172800000).toISOString(), // 2 days later
      deadlineStatus: "ACTIVE",
      testCasesCount: 4,
      submissionsCount: 8,
      createdAt: new Date().toISOString(),
    },
  ];

  async checkDeadline(
    assignmentId: string,
    submittedAt?: string,
  ): Promise<import("../../contracts/assignment.contract.js").DeadlineCheckResponse> {
    const asg = this.mockAssignments.find((a) => a.id === assignmentId);
    // If not found or ID contains 'expired', simulate past deadline
    const isExpiredById = assignmentId.toLowerCase().includes("expired") || assignmentId.toLowerCase().includes("late");
    const deadline = asg ? asg.deadline : isExpiredById ? new Date(Date.now() - 3600000).toISOString() : new Date(Date.now() + 86400000).toISOString();
    
    const subTime = submittedAt ? new Date(submittedAt).getTime() : Date.now();
    const deadTime = new Date(deadline).getTime();
    const isPastDeadline = isExpiredById || (!isNaN(subTime) && !isNaN(deadTime) && subTime > deadTime);

    return {
      assignmentId,
      deadline,
      isPastDeadline,
      deadlineStatus: isPastDeadline ? "ENDED" : "ACTIVE",
    };
  }

  async getAssignments(
    filter?: import("../../contracts/assignment.contract.js").AssignmentFilterQuery,
  ): Promise<import("../../contracts/assignment.contract.js").AssignmentQueryResponse> {
    let result = [...this.mockAssignments];

    if (filter?.classIds && filter.classIds.length > 0) {
      const set = new Set(filter.classIds);
      result = result.filter((a) => set.has(a.classId));
    } else if (filter?.classId) {
      result = result.filter((a) => a.classId === filter.classId);
    }

    if (filter?.status && filter.status !== "ALL") {
      result = result.filter((a) => a.deadlineStatus === filter.status);
    }

    if (filter?.search) {
      const q = filter.search.toLowerCase();
      result = result.filter((a) => a.title.toLowerCase().includes(q) || (a.description && a.description.toLowerCase().includes(q)));
    }

    return {
      success: true,
      data: result,
      total: result.length,
    };
  }

  async getAssignment(
    assignmentId: string,
  ): Promise<import("../../contracts/assignment.contract.js").AssignmentDetailResponse> {
    const asg = this.mockAssignments.find((a) => a.id === assignmentId);
    if (!asg) {
      return {
        success: true,
        data: {
          id: assignmentId,
          classId: "class-101",
          title: "Mock Assignment",
          language: "Java",
          deadline: new Date(Date.now() + 86400000).toISOString(),
          deadlineStatus: "ACTIVE",
          testCasesCount: 5,
          submissionsCount: 0,
        },
      };
    }
    return {
      success: true,
      data: asg,
    };
  }

  async markOverdueSubmissions(
    assignmentId: string,
  ): Promise<import("../../contracts/assignment.contract.js").OverdueSweepResponse> {
    return {
      assignmentId,
      markedCount: 3,
      studentIds: ["std-001", "std-002", "std-003"],
      status: "NOT_SUBMITTED",
    };
  }
}


// ─── Mock Sandbox Client ─────────────────────────────────────────────────────

export class MockSandboxClient implements ISandboxClient {
  public executionCount = 0;

  async execute(request: SandboxRequest): Promise<SandboxResponse> {
    this.executionCount++;
    const filePath = (request.fileRelativePath || "").toLowerCase();
    const subId = (request.submissionId || "").toLowerCase();

    let outcome: SandboxOutcome = "PASSED";
    let passedTests = 10;
    const totalTests = 10;
    let executionTimeMs = 1250;
    let errorMessage: string | undefined;

    if (filePath.includes("timeout") || subId.includes("timeout")) {
      outcome = "TIMEOUT";
      passedTests = 0;
      executionTimeMs = 30_000;
      errorMessage = "Execution exceeded time limit (30s)";
    } else if (filePath.includes("security_violation") || subId.includes("security_violation")) {
      outcome = "SECURITY_VIOLATION";
      passedTests = 0;
      executionTimeMs = 150;
      errorMessage = "Forbidden system call detected: Runtime.exec()";
    } else if (filePath.includes("compilation_error") || subId.includes("compilation_error")) {
      outcome = "COMPILATION_ERROR";
      passedTests = 0;
      executionTimeMs = 80;
      errorMessage =
        "error: incompatible types: String cannot be converted to int";
    } else if (
      filePath.includes("fail") ||
      filePath.includes("wrong") ||
      filePath.includes("random") ||
      filePath.includes("bug") ||
      filePath.includes("bad") ||
      filePath.includes("zero") ||
      subId.includes("fail") ||
      subId.includes("wrong")
    ) {
      outcome = "FAILED";
      passedTests = 0;
      executionTimeMs = 950;
      errorMessage = "Test cases failed: output does not match expected output.";
    } else if (filePath.includes("partial") || filePath.includes("half") || subId.includes("partial")) {
      outcome = "FAILED";
      passedTests = 5;
      executionTimeMs = 1100;
      errorMessage = "5 out of 10 test cases failed.";
    }

    const testResults: import("../../contracts/sandbox.contract.js").SandboxTestCaseResult[] =
      totalTests > 0
        ? Array.from({ length: totalTests }).map((_, idx) => {
            const isPassed = idx < passedTests;
            return {
              testCaseId: `tc-${idx + 1}`,
              passed: isPassed,
              actualOutput: isPassed
                ? `Test case ${idx + 1} passed output`
                : `Incorrect output on test case ${idx + 1}`,
              expectedOutput: `Test case ${idx + 1} passed output`,
              durationMs: 40 + idx * 10,
              error: isPassed
                ? undefined
                : "Output mismatch: expected output did not match actual output",
            };
          })
        : [];

    logger.info(
      { submissionId: request.submissionId, outcome, passedTests, totalTests, executionCount: this.executionCount },
      `[MOCK] Sandbox result: ${outcome} (${passedTests}/${totalTests})`,
    );

    return {
      outcome,
      passedTests,
      totalTests,
      executionTimeMs,
      output: outcome === "PASSED" ? "All tests passed" : `Passed ${passedTests}/${totalTests} test cases.`,
      errorMessage,
      testResults,
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
      { submissionId: request.submissionId, similarityPercent, isPlagiarism: isFlagged },
      `[MOCK] AST result: ${similarityPercent}% similarity`,
    );

    return {
      success: true,
      status: "DONE",
      similarityPercent,
      isPlagiarism: isFlagged,
      matchedPairs: isFlagged ? 1 : 0,
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
        feedback: "Program failed to compile.",
        compilationExplanation:
          "Compilation error: Incompatible types - String cannot be converted to int at line 15. Please check type casting or assigned parameter.",
      };
    }

    return {
      cleanCodeScore: 88,
      feedback:
        "Code has clear structure and adheres to camelCase variable naming. Consider adding null checks before method invocation.",
    };
  }
}
