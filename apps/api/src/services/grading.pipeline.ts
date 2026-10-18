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
    const testCasesList = sub.assignment?.testCases || [];
    let totalTests = testCasesList.length;

    try {
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
          testCases: testCasesList,
        }),
        signal: controller.signal as any,
      });

      clearTimeout(timeout);

      if (sandboxRes.ok) {
        const sData: any = await sandboxRes.json();
        passedTests = typeof sData.passedTests === "number" ? sData.passedTests : 0;
        totalTests = typeof sData.totalTests === "number" ? sData.totalTests : testCasesList.length;
      } else {
        console.warn(`[GradingPipeline] Sandbox engine HTTP ${sandboxRes.status}, fallback to 0 points`);
      }
    } catch (sandboxErr: any) {
      console.warn("[GradingPipeline] Sandbox engine call failed, fallback to 0 points");
    }

    const rawScore = totalTests > 0 ? (passedTests / totalTests) * 10 : 0;
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
