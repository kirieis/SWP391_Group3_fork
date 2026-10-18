import { Request, Response } from "express";
import {
  aiGateway as gateway,
  buildCleanCodeReviewPrompt,
  buildErrorExplanationPrompt,
  buildAssignmentGenerationPrompt,
  MAX_CODE_CHARS,
  getCachedReview,
  setCachedReview,
} from "../services/genai/index.js";

type PendingReason = "AI_UNAVAILABLE" | "INVALID_AI_RESPONSE" | "EMPTY_SOURCE";

interface ReviewResponse {
  reviewStatus: "DONE" | "PENDING";
  cleanCodeScore: number | null; // Bất biến: DONE => số 0-100; PENDING => null
  feedback: string;
  compilationExplanation?: string;
  pendingReason?: PendingReason;
}

const pending = (reason: PendingReason): ReviewResponse => ({
  reviewStatus: "PENDING",
  cleanCodeScore: null,
  feedback: "AI Review Pending",
  pendingReason: reason,
});

const FENCE_START = /^```(?:json)?\s*/i;
const FENCE_END = /\s*```$/;

/** Làm sạch và parse JSON từ LLM. Ném lỗi nếu không parse được. */
function extractJsonFromLlm(raw: string): Record<string, unknown> {
  const text = raw.trim().replace(FENCE_START, "").replace(FENCE_END, "");
  try {
    return JSON.parse(text);
  } catch {
    // LLM đôi khi thêm lời dẫn trước/sau JSON: lấy từ "{" đầu tới "}" cuối
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("NO_JSON");
  }
}

function parseCleanCodeReview(raw: string): { score: number; feedback: string } {
  const p = extractJsonFromLlm(raw);
  // Phải là kiểu number thật: Number(null) === 0 và Number("") === 0 sẽ lọt qua nếu chỉ dùng Number()
  if (typeof p.score !== "number" || !Number.isFinite(p.score)) {
    throw new Error("INVALID_SCORE");
  }
  const score = Math.round(p.score);
  if (score < 0 || score > 100) {
    throw new Error("SCORE_OUT_OF_RANGE");
  }

  const comments = Array.isArray(p.comments)
    ? p.comments.filter((c): c is string => typeof c === "string" && c.trim() !== "")
    : [];
  const summary =
    typeof p.summary === "string" && p.summary.trim()
      ? p.summary.trim()
      : "Đánh giá chất lượng mã nguồn:";
  const feedback = comments.length
    ? `${summary}\n\nChi tiết nhận xét:\n- ${comments.join("\n- ")}`
    : summary;
  return { score, feedback };
}

function parseErrorExplanation(raw: string): string {
  const p = extractJsonFromLlm(raw);
  const explanation = typeof p.explanation === "string" ? p.explanation.trim() : "";
  if (!explanation) {
    throw new Error("NO_EXPLANATION");
  }
  const type =
    typeof p.errorType === "string" && p.errorType.trim()
      ? p.errorType.trim()
      : "Lỗi biên dịch";
  const suggestion = typeof p.suggestion === "string" ? p.suggestion.trim() : "";
  return `[${type}] ${explanation}` + (suggestion ? `\n💡 Gợi ý khắc phục: ${suggestion}` : "");
}

function parseAssignment(raw: string) {
  const p = extractJsonFromLlm(raw);
  if (typeof p.title !== "string" || !p.title.trim()) {
    throw new Error("NO_TITLE");
  }
  if (typeof p.description !== "string" || !p.description.trim()) {
    throw new Error("NO_DESCRIPTION");
  }
  if (!Array.isArray(p.testCases) || p.testCases.length === 0) {
    throw new Error("NO_TESTCASES");
  }
  return {
    title: p.title.trim(),
    description: p.description.trim(),
    testCases: p.testCases,
  };
}

/**
 * POST /api/review  (nội bộ — Queue Worker gọi)
 */
export const reviewSubmission = async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const { submissionId, language } = body;
  const code: string = typeof body.sourceCode === "string" ? body.sourceCode : "";
  // Chấp nhận cả compileOutput lẫn stderr phòng khi Worker dùng tên khác
  const compileOutput: string =
    typeof body.compileOutput === "string"
      ? body.compileOutput
      : typeof body.stderr === "string"
        ? body.stderr
        : "";

  if (typeof submissionId !== "string" || !submissionId || typeof language !== "string" || !language) {
    return res.status(400).json({
      success: false,
      message: "Thiếu thông tin bắt buộc: submissionId, language.",
    });
  }

  try {
    // 1. Lỗi biên dịch (NFR-17). Giữ bất biến contract:
    //    AI giải thích được → DONE + cleanCodeScore = 0; AI lỗi → PENDING + cleanCodeScore = null.
    if (body.isCompilationError === true) {
      const COMPILE_FEEDBACK = "Your submission cannot be compiled.";
      const result = await gateway.chat(buildErrorExplanationPrompt(compileOutput, code, language));

      if (result.status !== "COMPLETED" || !result.data) {
        return res.status(200).json({
          ...pending("AI_UNAVAILABLE"),
          feedback: COMPILE_FEEDBACK,
        });
      }
      try {
        return res.status(200).json({
          reviewStatus: "DONE",
          cleanCodeScore: 0, // Cố định 0 điểm cho bài lỗi biên dịch
          feedback: COMPILE_FEEDBACK,
          compilationExplanation: parseErrorExplanation(result.data.content),
        } as ReviewResponse);
      } catch {
        return res.status(200).json({
          ...pending("INVALID_AI_RESPONSE"),
          feedback: COMPILE_FEEDBACK,
        });
      }
    }

    // 2. Chấm Clean Code (US-15)
    if (!code.trim()) {
      console.error(`[genai] EMPTY_SOURCE submissionId=${submissionId}`);
      return res.status(200).json(pending("EMPTY_SOURCE"));
    }

    // Kiểm tra cache SHA-256 (Việc 7 - P2)
    const cached = await getCachedReview(code, language);
    if (cached) {
      console.log(`[genai] Cache HIT for submissionId=${submissionId}`);
      return res.status(200).json({
        reviewStatus: "DONE",
        cleanCodeScore: cached.score,
        feedback: cached.feedback + "\n\n(Results from cache)",
      } as ReviewResponse);
    }

    const result = await gateway.chat(buildCleanCodeReviewPrompt(code, language));
    if (result.status !== "COMPLETED" || !result.data) {
      return res.status(200).json(pending("AI_UNAVAILABLE"));
    }

    try {
      const { score, feedback } = parseCleanCodeReview(result.data.content);
      const note =
        code.length > MAX_CODE_CHARS
          ? `\n\n(Note: code longer than ${MAX_CODE_CHARS} characters so only the first part is evaluated.)`
          : "";
      const finalFeedback = feedback + note;
      // Lưu cache nền (fail-safe)
      setCachedReview(code, language, { score, feedback: finalFeedback }).catch(() => { });

      return res.status(200).json({
        reviewStatus: "DONE",
        cleanCodeScore: score,
        feedback: finalFeedback,
      } as ReviewResponse);
    } catch (e: any) {
      console.warn(`[genai] INVALID_AI_RESPONSE submissionId=${submissionId} reason=${e?.message}`);
      return res.status(200).json(pending("INVALID_AI_RESPONSE"));
    }
  } catch (error) {
    // Lỗi bất ngờ: ghi log đầy đủ phía server, KHÔNG trả error.message cho client
    console.error(`[genai] review failed submissionId=${submissionId}`, error);
    return res.status(200).json(pending("AI_UNAVAILABLE"));
  }
};

const ALLOWED_LANGUAGES = ["Java", "Python", "C#"];
const ALLOWED_DIFFICULTY = ["easy", "medium", "hard"];
const MAX_TOPIC_LENGTH = 500;

/**
 * POST /api/assignments/generate  (Giảng viên — US-08)
 * Chỉ sinh bản nháp; Giảng viên phải review rồi mới lưu (SRS US-08).
 */
export const generateAssignment = async (req: Request, res: Response) => {
  const { topic, language, difficulty = "medium" } = req.body ?? {};

  if (typeof topic !== "string" || !topic.trim() || topic.length > MAX_TOPIC_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `Topic is required and at most ${MAX_TOPIC_LENGTH} characters.`,
    });
  }
  if (!ALLOWED_LANGUAGES.includes(language)) {
    return res.status(400).json({
      success: false,
      message: "Language must be Java, Python or C#.",
    });
  }
  if (!ALLOWED_DIFFICULTY.includes(difficulty)) {
    return res.status(400).json({
      success: false,
      message: "Difficulty must be easy, medium or hard.",
    });
  }

  try {
    const result = await gateway.chat(
      buildAssignmentGenerationPrompt(topic.trim(), language, difficulty)
    );

    if (result.status === "COMPLETED" && result.data) {
      try {
        return res.status(200).json({
          success: true,
          data: parseAssignment(result.data.content),
        });
      } catch {
        return res.status(502).json({
          success: false,
          message: "AI returned an invalid format. Please try again.",
        });
      }
    }
    return res.status(503).json({
      success: false,
      message: "Unable to generate assignment at this time due to AI service overload. Please try again later.",
    });
  } catch (error) {
    console.error("[genai] generateAssignment failed", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while generating assignment.",
    });
  }
};

/**
 * GET /api/stats  (nội bộ — giám sát hạn ngạch và sức khỏe Gateway)
 */
export const getAiStats = async (_req: Request, res: Response) => {
  const stats = await gateway.getStats();
  const config = gateway.getConfig();
  return res.status(200).json({
    success: true,
    config,
    stats,
  });
};
