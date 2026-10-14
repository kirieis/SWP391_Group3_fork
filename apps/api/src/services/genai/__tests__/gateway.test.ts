// ==============================================================================
// UNIT TESTS — AI Gateway (Mock providers, KHÔNG gọi API thật)
// Owner: Huy (Phân hệ 3)
// Chạy: npx tsx src/services/genai/__tests__/gateway.test.ts
//
// Test cases bao phủ:
// 1. Happy path: Primary trả về thành công
// 2. Primary fail (retryable) → Fallback thành công
// 3. Primary fail (non-retryable) → Dừng, không fallback
// 4. Cả 2 fail → AI_REVIEW_PENDING (pipeline không crash)
// 5. Stats counter hoạt động đúng
// ==============================================================================

import {
  AIProvider,
  AIRequest,
  AIResponse,
  AIProviderError,
  ProviderName,
} from "../types.js";
import { AIGateway, GatewayResult } from "../gateway.js";

// ==============================================================================
// Mock Provider Factory
// ==============================================================================

function createMockResponse(overrides?: Partial<AIResponse>): AIResponse {
  return {
    content: '{"score": 85, "comments": ["Good code"]}',
    provider: "groq",
    model: "mock-model",
    latencyMs: 150,
    tokenUsage: { prompt: 100, completion: 50, total: 150 },
    ...overrides,
  };
}

function createMockProvider(
  name: ProviderName,
  behavior: "success" | "rate_limited" | "auth_error" | "timeout" | "server_error"
): AIProvider {
  return {
    name,
    async chat(_request: AIRequest): Promise<AIResponse> {
      switch (behavior) {
        case "success":
          return createMockResponse({ provider: name });
        case "rate_limited":
          throw new AIProviderError(`${name} rate limited`, "RATE_LIMITED", name, 429);
        case "auth_error":
          throw new AIProviderError(`${name} auth failed`, "AUTH_ERROR", name, 401);
        case "timeout":
          throw new AIProviderError(`${name} timed out`, "TIMEOUT", name);
        case "server_error":
          throw new AIProviderError(`${name} server error`, "SERVER_ERROR", name, 500);
        default:
          throw new Error(`Unknown behavior: ${behavior}`);
      }
    },
    async healthCheck(): Promise<boolean> {
      return behavior === "success";
    },
  };
}

// ==============================================================================
// Test Runner (Lightweight — không cần thư viện test nặng như Jest)
// ==============================================================================

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string): void {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ ${message}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
}

// ==============================================================================
// Monkey-patch Gateway để inject Mock providers
// ==============================================================================

function createTestGateway(
  primaryBehavior: "success" | "rate_limited" | "auth_error" | "timeout" | "server_error",
  fallbackBehavior: "success" | "rate_limited" | "auth_error" | "timeout" | "server_error"
): AIGateway {
  // Tạo gateway instance rồi thay thế providers bằng mock
  // Dùng Object.assign để bypass private access (chỉ dùng trong test)
  const gateway = Object.create(AIGateway.prototype) as AIGateway;
  Object.assign(gateway, {
    primary: createMockProvider("groq", primaryBehavior),
    fallback: createMockProvider("cerebras", fallbackBehavior),
    config: {
      primaryProvider: "groq" as ProviderName,
      fallbackProvider: "cerebras" as ProviderName,
      requestTimeoutMs: 15000,
      maxRetriesPerProvider: 1,
    },
    keyPool: { groq: [], cerebras: [], gemini: [] },
    requestCounter: {},
    totalDeadlineMs: 40000,
  });
  return gateway;
}

const MOCK_REQUEST: AIRequest = {
  systemPrompt: "You are a test bot.",
  userPrompt: "Say hello.",
  maxTokens: 10,
  temperature: 0,
};

// ==============================================================================
// Test Cases
// ==============================================================================

async function testHappyPath(): Promise<void> {
  console.log("\n📋 Test 1: Happy Path — Primary success");
  const gateway = createTestGateway("success", "success");
  const result = await gateway.chat(MOCK_REQUEST);

  assertEqual(result.status, "COMPLETED", "Status should be COMPLETED");
  assert(result.data !== null, "Data should not be null");
  assertEqual(result.data?.provider, "groq", "Should use primary provider (groq)");
  assertEqual(result.attemptLog.length, 1, "Should have 1 attempt (only primary)");
  assert(result.error === undefined, "Error should be undefined");
}

async function testPrimaryFailFallbackSuccess(): Promise<void> {
  console.log("\n📋 Test 2: Primary rate limited → Fallback success");
  const gateway = createTestGateway("rate_limited", "success");
  const result = await gateway.chat(MOCK_REQUEST);

  assertEqual(result.status, "COMPLETED", "Status should be COMPLETED");
  assert(result.data !== null, "Data should not be null");
  assertEqual(result.data?.provider, "cerebras", "Should use fallback provider (cerebras)");
  assertEqual(result.attemptLog.length, 2, "Should have 2 attempts");
  assert(result.attemptLog[0]!.success === false, "First attempt should be failure");
  assert(result.attemptLog[1]!.success === true, "Second attempt should be success");
}

async function testPrimaryTimeoutFallbackSuccess(): Promise<void> {
  console.log("\n📋 Test 3: Primary timeout → Fallback success");
  const gateway = createTestGateway("timeout", "success");
  const result = await gateway.chat(MOCK_REQUEST);

  assertEqual(result.status, "COMPLETED", "Status should be COMPLETED");
  assertEqual(result.data?.provider, "cerebras", "Should use fallback");
  assertEqual(result.attemptLog[0]!.errorCode, "TIMEOUT", "First attempt error should be TIMEOUT");
}

async function testNonRetryableError(): Promise<void> {
  console.log("\n📋 Test 4: Primary AUTH_ERROR → Stop immediately (no fallback)");
  const gateway = createTestGateway("auth_error", "success");
  const result = await gateway.chat(MOCK_REQUEST);

  assertEqual(result.status, "AI_REVIEW_PENDING", "Status should be AI_REVIEW_PENDING");
  assert(result.data === null, "Data should be null");
  assertEqual(result.attemptLog.length, 1, "Should have only 1 attempt (no fallback for auth errors)");
  assert(result.error !== undefined, "Error message should be present");
}

async function testBothFail(): Promise<void> {
  console.log("\n📋 Test 5: Both providers fail → AI_REVIEW_PENDING");
  const gateway = createTestGateway("server_error", "rate_limited");
  const result = await gateway.chat(MOCK_REQUEST);

  assertEqual(result.status, "AI_REVIEW_PENDING", "Status should be AI_REVIEW_PENDING");
  assert(result.data === null, "Data should be null");
  assertEqual(result.attemptLog.length, 2, "Should have 2 attempts");
  assert(result.attemptLog[0]!.success === false, "First attempt should fail");
  assert(result.attemptLog[1]!.success === false, "Second attempt should fail");
  assert(result.error !== undefined && result.error.includes("All providers failed"), "Error should mention all providers failed");
}

async function testStatsCounter(): Promise<void> {
  console.log("\n📋 Test 6: Request counter tracks success and errors");
  const gateway = createTestGateway("success", "success");

  // 2 successful calls
  await gateway.chat(MOCK_REQUEST);
  await gateway.chat(MOCK_REQUEST);

  const stats = await gateway.getStats();
  const keys = Object.keys(stats);

  assert(keys.length > 0, "Stats should have at least 1 entry");

  // Tìm entry của groq (primary)
  const groqKey = keys.find((k) => k.startsWith("groq:"));
  assert(groqKey !== undefined, "Stats should have groq entry");
  if (groqKey) {
    assertEqual(stats[groqKey]!.total, 2, "Groq should have 2 total requests");
    assertEqual(stats[groqKey]!.errors, 0, "Groq should have 0 errors");
  }
}

async function testHealthCheck(): Promise<void> {
  console.log("\n📋 Test 7: Health check reports provider status");
  const gateway = createTestGateway("success", "timeout");
  const health = await gateway.healthCheck();

  assertEqual(health.primary.name, "groq", "Primary name should be groq");
  assertEqual(health.primary.healthy, true, "Primary should be healthy");
  assertEqual(health.fallback.name, "cerebras", "Fallback name should be cerebras");
  assertEqual(health.fallback.healthy, false, "Fallback should be unhealthy (timeout)");
}

async function testGetConfig(): Promise<void> {
  console.log("\n📋 Test 8: getConfig returns config without secrets");
  const gateway = createTestGateway("success", "success");
  const config = gateway.getConfig();

  assertEqual(config.primaryProvider, "groq", "Primary provider should be groq");
  assertEqual(config.fallbackProvider, "cerebras", "Fallback provider should be cerebras");
  assertEqual(config.requestTimeoutMs, 15000, "Timeout should be 15000ms");
  assertEqual(config.status, "initialized", "Status should be initialized");
  // Verify API keys are NOT exposed
  assert(!JSON.stringify(config).includes("key"), "Config should NOT contain API keys");
}

// ==============================================================================
// Run All Tests
// ==============================================================================

async function runAllTests(): Promise<void> {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║        AITA GenAI — Gateway Unit Tests               ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  await testHappyPath();
  await testPrimaryFailFallbackSuccess();
  await testPrimaryTimeoutFallbackSuccess();
  await testNonRetryableError();
  await testBothFail();
  await testStatsCounter();
  await testHealthCheck();
  await testGetConfig();

  console.log("\n" + "═".repeat(50));
  console.log(`📊 Results: ${passedTests}/${totalTests} passed, ${failedTests} failed`);

  if (failedTests > 0) {
    console.error(`\n❌ ${failedTests} test(s) FAILED!`);
    process.exit(1);
  } else {
    console.log("\n✅ All tests passed!");
  }
}

runAllTests().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
