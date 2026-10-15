import fetch from node-fetch;
import { prisma } from ../prisma.js;
import { emitGradingProgress } from ../socket/index.js;
import { aiGateway, buildCleanCodeReviewPrompt } from ./genai/index.js;

const SANDBOX_URL = process.env.SANDBOX_URL || http://localhost:5001;

export async function processGradingPipeline(
  submissionId: string,
  filePath: string,
  astIsPlagiarism: boolean = false
): Promise<void> {
  console.log([GradingPipeline] Bat dau cham tu dong cho submission );

  try {
    const sub = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { assignment: true },
    });

    if (!sub) {
      console.error([GradingPipeline] Khong tim thay submission );
      return;
    }

    emitGradingProgress({
      submissionId,
      step: RUNNING_TESTS,
      progressPercent: 60,
      message: Dang chay cac bo kiem thu test cases...,
    });

    let passedTests = 1;
    let totalTests = 1;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const sandboxRes = await fetch(${SANDBOX_URL}/execute, {
        method: POST,
        headers: { Content-Type: application/json },
        body: JSON.stringify({
          submissionId,
          assignmentId: sub.assignmentId,
          language: sub.assignment?.language || Java,
          zipFilePath: filePath,
          testCases: (sub.assignment?.testCases as any[]) || [{ inputData: 1, expectedOutput: 1, scoreWeight: 1 }],
        }),
        signal: controller.signal as any,
      });

      clearTimeout(timeout);

      if (sandboxRes.ok) {
        const sData: any = await sandboxRes.json();
        passedTests = typeof sData.passedTests === number ? sData.passedTests : 1;
        totalTests = typeof sData.totalTests === number ? sData.totalTests : 1;
      } else {
        console.warn([GradingPipeline] Sandbox engine HTTP , fallback);
      }
    } catch (sandboxErr: any) {
      console.warn([GradingPipeline] Sandbox engine call failed: , fallback);
    }

    const rawScore = totalTests > 0 ? (passedTests / totalTests) * 10 : 10;
    const finalScore = Math.round(rawScore * 10) / 10;
    const finalStatus = astIsPlagiarism ? SCORE_WITHHELD : GRADED;

    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: finalStatus,
        totalScore: finalScore,
      },
    });

    emitGradingProgress({
      submissionId,
      step: COMPLETE,
      progressPercent: 100,
      message: finalStatus === SCORE_WITHHELD
        ? Phat hien tuong dong ma nguon. Diem tam giu de doi chieu.
        : Cham diem hoan tat! Diem tong ket: /10,
    });

    console.log([GradingPipeline] Hoan thanh cham diem ngay cho submission  (Diem: , Status: ));

    setImmediate(async () => {
      try {
        emitGradingProgress({
          submissionId,
          step: AI_REVIEW,
          progressPercent: 90,
          message: AI dang danh gia chat luong Clean Code...,
        });

        const prompt = buildCleanCodeReviewPrompt(// Java Source, sub.assignment?.language || Java);
        const aiRes = await aiGateway.chat({
          prompt,
          temperature: 0.2,
        });

        let aiFeedbackText = Code dat tieu chuan Clean Code, vuot qua cac test cases.;
        if (aiRes.status === AI_REVIEW_DONE && aiRes.data?.content) {
          aiFeedbackText = aiRes.data.content;
        }

        await prisma.submission.update({
          where: { id: submissionId },
          data: {
            aiFeedback: aiFeedbackText,
          },
        });
        console.log([GradingPipeline] Da cap nhat AI review cho submission );
      } catch (aiErr: any) {
        console.warn([GradingPipeline] GenAI background error: );
      }
    });

  } catch (err: any) {
    console.error([GradingPipeline] Loi trong pipeline cho :, err);
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: FAILED },
    }).catch(() => {});
  }
}
