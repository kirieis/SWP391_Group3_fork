// ==============================================================================
// BENCHMARK SCRIPT — Đo hiệu năng các AI Providers
// Owner: Huy (Phân hệ 3)
// Cách chạy: npx tsx src/services/genai/benchmark/run.ts
//
// Script sẽ:
// 1. Gửi 10 prompt chuẩn đến mỗi provider (Groq, Cerebras, Gemini)
// 2. Lặp lại 3 lần mỗi prompt (tổng cộng 30 requests/provider)
// 3. Tính toán: Avg latency, P95 latency, Error rate, Tokens/s
// 4. Xuất kết quả ra console và file CSV
// ==============================================================================

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Nạp .env từ thư mục apps/api/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

import { createProvider } from "../providers/index.js";
import { BENCHMARK_PROMPTS } from "../prompts/index.js";
import type { ProviderName, BenchmarkRun, BenchmarkSummary } from "../types.js";

// ==============================================================================
// Cấu hình Benchmark
// ==============================================================================

const PROVIDERS_TO_TEST: ProviderName[] = ["groq", "cerebras", "gemini"];
const RUNS_PER_PROMPT = 1;
const TIMEOUT_MS = 30000; // Benchmark cho phép timeout cao hơn production
const DELAY_BETWEEN_REQUESTS_MS = 1000; // Tránh rate limit khi test liên tục

// ==============================================================================
// Hàm tiện ích
// ==============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiKey(provider: ProviderName): string {
  const keys: Record<ProviderName, string | undefined> = {
    groq: process.env.GROQ_API_KEY,
    cerebras: process.env.CEREBRAS_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
  };
  return keys[provider] ?? "";
}

/**
 * Tính percentile (vd: P95) từ mảng số.
 */
function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

// ==============================================================================
// Logic chạy Benchmark
// ==============================================================================

async function benchmarkProvider(providerName: ProviderName): Promise<BenchmarkRun[]> {
  const apiKey = getApiKey(providerName);
  if (!apiKey || apiKey.includes("your_")) {
    console.warn(`⚠️  Skipping ${providerName}: API key not configured`);
    return [];
  }

  let provider;
  try {
    provider = createProvider(providerName, apiKey, TIMEOUT_MS);
  } catch (err) {
    console.warn(`⚠️  Skipping ${providerName}: ${err instanceof Error ? err.message : err}`);
    return [];
  }

  const runs: BenchmarkRun[] = [];

  for (const prompt of BENCHMARK_PROMPTS) {
    for (let run = 1; run <= RUNS_PER_PROMPT; run++) {
      const runLabel = `${providerName}/${prompt.label}/run${run}`;
      process.stdout.write(`  ⏳ ${runLabel}... `);

      const startTime = Date.now();
      try {
        const response = await provider.chat({
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          maxTokens: prompt.maxTokens,
          temperature: prompt.temperature,
        });

        const tokensPerSecond =
          response.latencyMs > 0
            ? (response.tokenUsage.completion / (response.latencyMs / 1000))
            : 0;

        runs.push({
          provider: providerName,
          model: response.model,
          promptLabel: prompt.label,
          latencyMs: response.latencyMs,
          tokensPerSecond: Math.round(tokensPerSecond),
          tokenUsage: response.tokenUsage,
          success: true,
        });

        console.log(`✅ ${response.latencyMs}ms | ${Math.round(tokensPerSecond)} tok/s`);
      } catch (err: unknown) {
        const latencyMs = Date.now() - startTime;
        const message = err instanceof Error ? err.message : String(err);

        runs.push({
          provider: providerName,
          model: "unknown",
          promptLabel: prompt.label,
          latencyMs,
          tokensPerSecond: 0,
          tokenUsage: { prompt: 0, completion: 0, total: 0 },
          success: false,
          errorMessage: message,
        });

        console.log(`❌ FAILED (${latencyMs}ms): ${message.substring(0, 100)}`);
      }

      // Delay giữa các requests để tránh rate limit
      if (run < RUNS_PER_PROMPT || BENCHMARK_PROMPTS.indexOf(prompt) < BENCHMARK_PROMPTS.length - 1) {
        await sleep(DELAY_BETWEEN_REQUESTS_MS);
      }
    }
  }

  return runs;
}

function summarizeRuns(runs: BenchmarkRun[]): BenchmarkSummary | null {
  if (runs.length === 0) return null;

  const successful = runs.filter((r) => r.success);
  const latencies = successful.map((r) => r.latencyMs);
  const tokensPerSec = successful.map((r) => r.tokensPerSecond);

  return {
    provider: runs[0]!.provider,
    model: successful[0]?.model ?? "unknown",
    totalRuns: runs.length,
    successfulRuns: successful.length,
    errorRate: Number(((runs.length - successful.length) / runs.length * 100).toFixed(1)),
    avgLatencyMs: Math.round(
      latencies.reduce((sum, v) => sum + v, 0) / (latencies.length || 1)
    ),
    p95LatencyMs: Math.round(percentile(latencies, 95)),
    avgTokensPerSecond: Math.round(
      tokensPerSec.reduce((sum, v) => sum + v, 0) / (tokensPerSec.length || 1)
    ),
  };
}

function exportToCsv(allRuns: BenchmarkRun[], outputPath: string): void {
  const header = "provider,model,promptLabel,latencyMs,tokensPerSecond,promptTokens,completionTokens,totalTokens,success,errorMessage";
  const rows = allRuns.map((r) =>
    [
      r.provider,
      r.model,
      r.promptLabel,
      r.latencyMs,
      r.tokensPerSecond,
      r.tokenUsage.prompt,
      r.tokenUsage.completion,
      r.tokenUsage.total,
      r.success,
      r.errorMessage ? `"${r.errorMessage.replace(/"/g, '""')}"` : "",
    ].join(",")
  );

  const csv = [header, ...rows].join("\n");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, csv, "utf-8");
  console.log(`\n📄 Raw data exported to: ${outputPath}`);
}

// ==============================================================================
// Main
// ==============================================================================

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║     AITA-Intelligent — AI Provider Benchmark        ║");
  console.log("║     Phân hệ 3 (Huy) | SWP391 Group 3               ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");
  console.log(`📋 Prompts: ${BENCHMARK_PROMPTS.length} | Runs per prompt: ${RUNS_PER_PROMPT}`);
  console.log(`🔌 Providers to test: ${PROVIDERS_TO_TEST.join(", ")}\n`);

  const allRuns: BenchmarkRun[] = [];
  const summaries: BenchmarkSummary[] = [];

  for (const providerName of PROVIDERS_TO_TEST) {
    console.log(`\n🔵 Testing provider: ${providerName.toUpperCase()}`);
    console.log("─".repeat(50));

    const runs = await benchmarkProvider(providerName);
    allRuns.push(...runs);

    const summary = summarizeRuns(runs);
    if (summary) summaries.push(summary);
  }

  // Print summary table
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║                 BENCHMARK RESULTS                    ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  if (summaries.length === 0) {
    console.log("⚠️  No providers were tested. Please configure API keys in .env file.");
    return;
  }

  console.log(
    "Provider".padEnd(12) +
    "Model".padEnd(28) +
    "Runs".padEnd(8) +
    "OK".padEnd(6) +
    "Err%".padEnd(8) +
    "Avg(ms)".padEnd(10) +
    "P95(ms)".padEnd(10) +
    "Tok/s".padEnd(8)
  );
  console.log("─".repeat(90));

  for (const s of summaries) {
    console.log(
      s.provider.padEnd(12) +
      s.model.substring(0, 26).padEnd(28) +
      String(s.totalRuns).padEnd(8) +
      String(s.successfulRuns).padEnd(6) +
      `${s.errorRate}%`.padEnd(8) +
      String(s.avgLatencyMs).padEnd(10) +
      String(s.p95LatencyMs).padEnd(10) +
      String(s.avgTokensPerSecond).padEnd(8)
    );
  }

  // Recommendation
  const best = summaries
    .filter((s) => s.errorRate < 50)
    .sort((a, b) => a.avgLatencyMs - b.avgLatencyMs);

  if (best.length >= 2) {
    console.log(`\n🏆 Recommendation:`);
    console.log(`   Primary:  ${best[0]!.provider} (avg ${best[0]!.avgLatencyMs}ms, ${best[0]!.errorRate}% errors)`);
    console.log(`   Fallback: ${best[1]!.provider} (avg ${best[1]!.avgLatencyMs}ms, ${best[1]!.errorRate}% errors)`);
  } else if (best.length === 1) {
    console.log(`\n🏆 Recommendation: Primary = ${best[0]!.provider} (only viable provider)`);
  }

  // Export CSV
  const csvPath = path.resolve(__dirname, "../../../../docs/genai/benchmark-results.csv");
  exportToCsv(allRuns, csvPath);

  console.log("\n✅ Benchmark complete!\n");
}

main().catch((err) => {
  console.error("❌ Benchmark failed:", err);
  process.exit(1);
});
