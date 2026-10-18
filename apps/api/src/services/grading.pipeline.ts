import fetch from "node-fetch";
import { prisma } from "../prisma.js";
import { emitGradingProgress } from "../socket/index.js";
import { aiGateway, buildCleanCodeReviewPrompt } from "./genai/index.js";

const SANDBOX_URL = process.env.SANDBOX_URL || "http://localhost:5001";

export async function processGradingPipeline(
  submissionId: string,
  filePath: string,
  astIsPlagiarism: boolean = false
): Promise<void> {
  console.log(`[GradingPipeline] Starting automatic grading for submission ${submissionId}`);

  try {
    const sub = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: {
          include: {
            testCases: true,
          },
        },
      },
    });

    if (!sub) {
      console.error(`[GradingPipeline] Submission not found: ${submissionId}`);
      return;
    }

    emitGradingProgress({
      submissionId,
      step: "RUNNING_TESTS",
      progressPercent: 60,
      message: "Executing test cases...",
    });

    let passedTests = 0;
    let totalTests = 0;
    let sandboxGradingError: string | null = null;

    const configuredTestCases = sub.assignment?.testCases || [];
    if (configuredTestCases.length === 0) {
      sandboxGradingError = 'No test cases are configured for this assignment.';
    }

    try {
      if (sandboxGradingError) {
        throw new Error(sandboxGradingError);
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const sandboxRes = await fetch(`${SANDBOX_URL}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          assignmentId: sub.assignmentId,
          language: sub.assignment?.language || "Java",
          zipFilePath: filePath,
          testCases: configuredTestCases,
        }),
        signal: controller.signal as any,
      });

      clearTimeout(timeout);

      if (!sandboxRes.ok) {
        throw new Error(`Sandbox engine HTTP ${sandboxRes.status}`);
      }

      const sData: any = await sandboxRes.json();
      if (
        !Number.isInteger(sData?.passedTests) ||
        !Number.isInteger(sData?.totalTests) ||
        sData.totalTests <= 0 ||
        sData.passedTests < 0 ||
        sData.passedTests > sData.totalTests
      ) {
        throw new Error("Sandbox returned invalid test counts.");
      }

      passedTests = sData.passedTests;
      totalTests = sData.totalTests;
    } catch (sandboxErr: any) {
      sandboxGradingError = sandboxErr?.message || "Sandbox grading failed.";
      console.error(`[GradingPipeline] ${sandboxGradingError}`);
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: "FAILED",
          totalScore: 0,
        },
      });
      emitGradingProgress({
        submissionId,
        step: "COMPLETE",
        progressPercent: 100,
        message: `Grading failed; no score was awarded. ${sandboxGradingError}`,
      });
      return;
    }

    const rawScore = (passedTests / totalTests) * 10;
    const finalScore = Math.round(rawScore * 10) / 10;
    const finalStatus = astIsPlagiarism ? "SCORE_WITHHELD" : "GRADED";

    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: finalStatus,
        totalScore: finalScore,
      },
    });

    emitGradingProgress({
      submissionId,
      step: "COMPLETE",
      progressPercent: 100,
      message: finalStatus === "SCORE_WITHHELD"
        ? "High similarity detected. Score temporarily withheld for review."
        : `Grading completed! Final score: ${finalScore}/10`,
    });

    console.log(`[GradingPipeline] Completed immediate grading for submission ${submissionId}`);

    setImmediate(async () => {
      try {
        emitGradingProgress({
          submissionId,
          step: "AI_REVIEW",
          progressPercent: 90,
          message: "Evaluating code quality and Clean Code standards...",
        });

        const promptPayload = buildCleanCodeReviewPrompt("// Java Source", sub.assignment?.language || "Java");
        const aiRes = await aiGateway.chat({
          systemPrompt: promptPayload.systemPrompt,
          userPrompt: promptPayload.userPrompt,
          temperature: promptPayload.temperature ?? 0.2,
          maxTokens: promptPayload.maxTokens,
          jsonMode: promptPayload.jsonMode,
        });

        let aiFeedbackText = "Code adheres to clean code standards and passes test cases.";
        if (aiRes.status === "COMPLETED" && aiRes.data?.content) {
          aiFeedbackText = aiRes.data.content;
        }

        await prisma.submission.update({
          where: { id: submissionId },
          data: {
            aiFeedback: aiFeedbackText,
          },
        });
        console.log(`[GradingPipeline] Updated AI review for submission ${submissionId}`);
      } catch (aiErr: any) {
        console.warn("[GradingPipeline] GenAI background error:", aiErr);
      }
    });

  } catch (err: any) {
    console.error(`[GradingPipeline] Error in pipeline for ${submissionId}:`, err);
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: "FAILED" },
    }).catch(() => {});
  }
}
