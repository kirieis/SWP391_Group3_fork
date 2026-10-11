/**
 * ast.client.ts — ADR-001 §6: Wrapper duy nhất cho mọi lời gọi AST Engine
 *
 * Toàn bộ code gọi Python FastAPI engine phải đi qua module này.
 * Khi cần đổi URL, thêm retry, hoặc chuyển sang BullMQ worker (ADR-001 §10),
 * chỉ cần sửa file này — không sửa controller.
 *
 * Hợp đồng API: ADR-001 §4 (POST /analyze, /compare, /compare/batch)
 */

import fetch from "node-fetch";
import { env } from "../config/env.js";

// ─── Kiểu dữ liệu trả về từ engine ──────────────────────────────────────────

export interface ASTAnalyzeResult {
    submission_id: string;
    analysis_mode: "ast" | "lex";
    parse_ok: boolean;
    syntax_error_count: number;
    fallback_reason: string | null;
    token_count: { ast: number; lex: number };
    warnings: string[];
    fingerprint: Record<string, unknown>;
}

export interface ASTCompareResult {
    submission_1_id: string;
    submission_2_id: string;
    similarity_percent: number;
    level: "SAFE" | "WARNING" | "DANGER";
    flag: "PLAGIARISM_DETECTED" | null;
    mode: "ast" | "lex";
    shared_hashes: number;
    jaccard_percent: number;
    matched_fragments: Array<{ a_lines: [number, number]; b_lines: [number, number] }>;
    note: string | null;
}

export interface ASTBatchResult {
    submission_count: number;
    match_count: number;
    matches: ASTCompareResult[];
}

export interface ASTSubmissionInput {
    submission_id: string;
    /** Dùng fingerprint (đã lưu DB) hoặc source_code, không dùng cả hai */
    fingerprint?: Record<string, unknown>;
    source_code?: string;
}

// ─── Cấu hình client ─────────────────────────────────────────────────────────

const AST_ENGINE_URL = process.env.AST_ENGINE_URL || "http://localhost:8000";

/**
 * Timeout phía gateway: 10 giây (lớn hơn ngân sách 5 giây của engine — ADR-001 §6)
 */
const GATEWAY_TIMEOUT_MS = 10_000;

/**
 * Hàm tiện ích: gọi engine với AbortController timeout.
 * Trả undefined nếu engine lỗi 5xx / timeout (caller xử lý graceful degradation).
 */
async function engineFetch<T>(
    path: string,
    body: unknown
): Promise<T | undefined> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);

    try {
        const res = await fetch(`${AST_ENGINE_URL}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal as any,
        });

        if (!res.ok) {
            // 4xx: không retry — lỗi đầu vào. Log rồi trả undefined để caller KHÔNG retry.
            if (res.status >= 400 && res.status < 500) {
                const errBody = await res.json().catch(() => ({}));
                console.warn(`[astClient] Engine trả ${res.status} cho ${path}:`, errBody);
                return undefined;
            }
            // 5xx: ném lỗi để caller có thể retry
            throw new Error(`Engine HTTP ${res.status} tại ${path}`);
        }

        return (await res.json()) as T;
    } catch (err: any) {
        if (err?.name === "AbortError") {
            console.warn(`[astClient] Timeout (${GATEWAY_TIMEOUT_MS}ms) gọi ${path}`);
        } else {
            console.error(`[astClient] Lỗi gọi engine ${path}:`, err?.message);
        }
        return undefined; // Lỗi engine KHÔNG chặn luồng nộp bài (ADR-001 §6)
    } finally {
        clearTimeout(timer);
    }
}

// ─── Public API của astClient ────────────────────────────────────────────────

export const astClient = {
    /**
     * POST /analyze — Tính fingerprint cho 1 bài nộp (ADR-001 §4.1)
     *
     * @param submissionId  UUID bài nộp trong DB
     * @param sourceCode    Nội dung code Java (≤ 100.000 ký tự)
     * @returns ASTAnalyzeResult | undefined (undefined khi engine lỗi/timeout)
     */
    analyze: async (
        submissionId: string,
        sourceCode: string
    ): Promise<ASTAnalyzeResult | undefined> => {
        return engineFetch<ASTAnalyzeResult>("/analyze", {
            submission_id: submissionId,
            source_code: sourceCode,
            language: "java",
        });
    },

    /**
     * POST /compare — So sánh 2 bài nộp (ADR-001 §4.2)
     * Ưu tiên truyền `fingerprint` (đã lưu DB) để tránh phân tích lại.
     */
    compare: async (
        a: ASTSubmissionInput,
        b: ASTSubmissionInput,
        options?: { whitelist?: string[]; with_fragments?: boolean }
    ): Promise<ASTCompareResult | undefined> => {
        return engineFetch<ASTCompareResult>("/compare", {
            submission_1: a,
            submission_2: b,
            whitelist: options?.whitelist ?? [],
            with_fragments: options?.with_fragments ?? true,
        });
    },

    /**
     * POST /compare/batch — So sánh N bài trong 1 lần gọi (ADR-001 §4.3)
     * Giới hạn: 2–500 bài, tối đa 20 bài gửi source_code (còn lại dùng fingerprint).
     *
     * @param minPercent  Ngưỡng tối thiểu để ghi vào PLAGIARISM_MATCHES (mặc định 30%)
     */
    compareBatch: async (
        submissions: ASTSubmissionInput[],
        options?: { minPercent?: number; whitelist?: string[]; with_fragments?: boolean }
    ): Promise<ASTBatchResult | undefined> => {
        return engineFetch<ASTBatchResult>("/compare/batch", {
            submissions,
            min_percent: options?.minPercent ?? 30,
            whitelist: options?.whitelist ?? [],
            with_fragments: options?.with_fragments ?? true,
        });
    },
};
