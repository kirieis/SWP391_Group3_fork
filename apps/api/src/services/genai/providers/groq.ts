// ==============================================================================
// GROQ PROVIDER — Kết nối với Groq Cloud API (OpenAI-compatible)
// Owner: Huy (Phân hệ 3)
// Docs: https://console.groq.com/docs/api-reference#chat-create
// ==============================================================================

import { AIRequest, AIResponse, AIProviderError } from "../types.js";
import { BaseProvider } from "./base.js";

/**
 * Groq sử dụng format OpenAI-compatible, nên body/response gần giống OpenAI.
 * Model mặc định: llama-3.3-70b-versatile (free tier, tốc độ rất nhanh).
 */
export class GroqProvider extends BaseProvider {
  constructor(apiKey: string, timeoutMs: number) {
    super({
      name: "groq",
      apiKey,
      baseUrl: "https://api.groq.com/openai/v1",
      model: process.env.GROQ_MODEL ?? "qwen/qwen3.8-27b",
      timeoutMs,
    });
  }

  protected getEndpointPath(): string {
    return "/chat/completions";
  }

  protected buildRequestBody(request: AIRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userPrompt },
      ],
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.2,
    };
    if (request.jsonMode) {
      body.response_format = { type: "json_object" };
    }
    return body;
  }

  protected parseResponse(data: unknown, latencyMs: number): AIResponse {
    const parsed = data as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const content = parsed.choices?.[0]?.message?.content;
    if (!content) {
      throw new AIProviderError(
        "Groq returned empty or malformed response",
        "INVALID_RESPONSE",
        this.name
      );
    }

    return {
      content,
      provider: this.name,
      model: parsed.model ?? this.model,
      latencyMs,
      tokenUsage: {
        prompt: parsed.usage?.prompt_tokens ?? 0,
        completion: parsed.usage?.completion_tokens ?? 0,
        total: parsed.usage?.total_tokens ?? 0,
      },
    };
  }
}
