// ==============================================================================
// GEMINI PROVIDER — Kết nối với Google Gemini API (REST, KHÔNG dùng OpenAI format)
// Owner: Huy (Phân hệ 3)
// Docs: https://ai.google.dev/gemini-api/docs/text-generation
// ==============================================================================

import { AIRequest, AIResponse, AIProviderError } from "../types.js";
import { BaseProvider } from "./base.js";

/**
 * Gemini API có format request/response riêng (KHÁC OpenAI).
 * API key được truyền qua query parameter thay vì Authorization header.
 * Model mặc định: gemini-2.0-flash (free tier, nhanh, hỗ trợ JSON output).
 */
export class GeminiProvider extends BaseProvider {
  constructor(apiKey: string, timeoutMs: number) {
    super({
      name: "gemini",
      apiKey,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
      timeoutMs,
    });
  }

  /**
   * Gemini truyền API key qua query param, không dùng Bearer token.
   */
  protected getEndpointPath(): string {
    return `/models/${this.model}:generateContent?key=${this.apiKey}`;
  }

  /**
   * Override: Gemini không dùng Authorization header.
   */
  protected buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
    };
  }

  /**
   * Gemini request format: system_instruction + contents (khác OpenAI messages).
   */
  protected buildRequestBody(request: AIRequest): Record<string, unknown> {
    return {
      system_instruction: {
        parts: [{ text: request.systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: request.userPrompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 2048,
        temperature: request.temperature ?? 0.2,
        ...(request.jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    };
  }

  /**
   * Gemini response format: candidates[0].content.parts[0].text
   * Token usage nằm trong usageMetadata.
   */
  protected parseResponse(data: unknown, latencyMs: number): AIResponse {
    const parsed = data as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
      modelVersion?: string;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      throw new AIProviderError(
        "Gemini returned empty or malformed response",
        "INVALID_RESPONSE",
        this.name
      );
    }

    return {
      content,
      provider: this.name,
      model: parsed.modelVersion ?? this.model,
      latencyMs,
      tokenUsage: {
        prompt: parsed.usageMetadata?.promptTokenCount ?? 0,
        completion: parsed.usageMetadata?.candidatesTokenCount ?? 0,
        total: parsed.usageMetadata?.totalTokenCount ?? 0,
      },
    };
  }
}
