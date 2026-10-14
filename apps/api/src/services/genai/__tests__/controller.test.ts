import assert from "node:assert/strict";
import { aiGateway } from "../instance.js";
import { reviewSubmission, generateAssignment } from "../../../controllers/genai.controller.js";

let passed = 0;
let failed = 0;

async function it(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

// Giả lập Express Request & Response
function mockReqRes(body: Record<string, any>) {
  const req = { body } as any;
  let statusCode = 200;
  let jsonBody: any = null;

  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: any) {
      jsonBody = data;
      return res;
    },
  } as any;

  return { req, res, getStatus: () => statusCode, getBody: () => jsonBody };
}

async function run() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║     AITA GenAI — Controller Unit Tests               ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const originalChat = aiGateway.chat;

  console.log("📋 1. reviewSubmission Endpoint (US-15 & NFR-17)");

  await it("Trả về 400 nếu thiếu submissionId hoặc language", async () => {
    const { req, res, getStatus, getBody } = mockReqRes({ submissionId: "" });
    await reviewSubmission(req, res);
    assert.equal(getStatus(), 400);
    assert.equal(getBody().success, false);
  });

  await it("Mã nguồn rỗng -> reviewStatus: PENDING, cleanCodeScore: null, reason: EMPTY_SOURCE", async () => {
    const { req, res, getStatus, getBody } = mockReqRes({
      submissionId: "sub-1",
      language: "Java",
      sourceCode: "   ",
    });
    await reviewSubmission(req, res);
    assert.equal(getStatus(), 200);
    assert.equal(getBody().reviewStatus, "PENDING");
    assert.equal(getBody().cleanCodeScore, null);
    assert.equal(getBody().pendingReason, "EMPTY_SOURCE");
  });

  await it("Lỗi biên dịch + AI thành công -> DONE, cleanCodeScore: 0, có explanation", async () => {
    aiGateway.chat = async () => ({
      status: "COMPLETED",
      data: {
        content: JSON.stringify({
          errorType: "Lỗi cú pháp",
          explanation: "Thiếu dấu chấm phẩy ở dòng 5.",
          suggestion: "Thêm ';' vào cuối dòng 5.",
        }),
        model: "mock-model",
        tokenUsage: { prompt: 10, completion: 20, total: 30 },
        latencyMs: 100,
        provider: "groq",
      },
      attemptLog: [],
    });

    const { req, res, getStatus, getBody } = mockReqRes({
      submissionId: "sub-2",
      language: "Java",
      isCompilationError: true,
      compileOutput: "Main.java:5: error: ';' expected",
      sourceCode: "int x = 10",
    });

    await reviewSubmission(req, res);
    assert.equal(getStatus(), 200);
    assert.equal(getBody().reviewStatus, "DONE");
    assert.equal(getBody().cleanCodeScore, 0, "Bắt buộc điểm clean code = 0 khi lỗi biên dịch");
    assert(getBody().compilationExplanation.includes("Thiếu dấu chấm phẩy"));
  });

  await it("Lỗi biên dịch + AI thất bại -> PENDING, cleanCodeScore: null", async () => {
    aiGateway.chat = async () => ({
      status: "AI_REVIEW_PENDING",
      data: null,
      error: "Provider down",
      attemptLog: [],
    });

    const { req, res, getStatus, getBody } = mockReqRes({
      submissionId: "sub-3",
      language: "Java",
      isCompilationError: true,
      compileOutput: "Error...",
      sourceCode: "int x = 10",
    });

    await reviewSubmission(req, res);
    assert.equal(getStatus(), 200);
    assert.equal(getBody().reviewStatus, "PENDING");
    assert.equal(getBody().cleanCodeScore, null, "Bất biến: PENDING thì cleanCodeScore bắt buộc null");
    assert.equal(getBody().pendingReason, "AI_UNAVAILABLE");
  });

  await it("Chấm Clean Code thành công -> DONE, cleanCodeScore: 85, feedback đầy đủ", async () => {
    aiGateway.chat = async () => ({
      status: "COMPLETED",
      data: {
        content: JSON.stringify({
          score: 85,
          comments: ["Đặt tên biến rõ nghĩa", "Nên tách hàm nhỏ hơn"],
          summary: "Mã nguồn cấu trúc tốt.",
        }),
        model: "mock-model",
        tokenUsage: { prompt: 10, completion: 20, total: 30 },
        latencyMs: 150,
        provider: "groq",
      },
      attemptLog: [],
    });

    const { req, res, getStatus, getBody } = mockReqRes({
      submissionId: "sub-4",
      language: "Java",
      sourceCode: "public class Calculator { public int add(int a, int b) { return a + b; } }",
    });

    await reviewSubmission(req, res);
    assert.equal(getStatus(), 200);
    assert.equal(getBody().reviewStatus, "DONE");
    assert.equal(getBody().cleanCodeScore, 85);
    assert(getBody().feedback.includes("Đặt tên biến rõ nghĩa"));
  });

  await it("Chấm Clean Code nhưng AI trả JSON sai định dạng -> PENDING, cleanCodeScore: null", async () => {
    aiGateway.chat = async () => ({
      status: "COMPLETED",
      data: {
        content: "Xin lỗi, tôi không thể đánh giá đoạn mã này.", // Không phải JSON
        model: "mock-model",
        tokenUsage: { prompt: 10, completion: 20, total: 30 },
        latencyMs: 120,
        provider: "groq",
      },
      attemptLog: [],
    });

    const { req, res, getStatus, getBody } = mockReqRes({
      submissionId: "sub-5",
      language: "Java",
      sourceCode: "public class App {}",
    });

    await reviewSubmission(req, res);
    assert.equal(getStatus(), 200);
    assert.equal(getBody().reviewStatus, "PENDING");
    assert.equal(getBody().cleanCodeScore, null, "JSON sai thì cleanCodeScore phải là null");
    assert.equal(getBody().pendingReason, "INVALID_AI_RESPONSE");
  });

  console.log("\n📋 2. generateAssignment Endpoint (US-08)");

  await it("Thiếu topic -> 400", async () => {
    const { req, res, getStatus, getBody } = mockReqRes({
      topic: "",
      language: "Java",
    });
    await generateAssignment(req, res);
    assert.equal(getStatus(), 400);
    assert.equal(getBody().success, false);
  });

  await it("Ngôn ngữ không được hỗ trợ -> 400", async () => {
    const { req, res, getStatus, getBody } = mockReqRes({
      topic: "Recursion",
      language: "Ruby",
    });
    await generateAssignment(req, res);
    assert.equal(getStatus(), 400);
    assert.equal(getBody().success, false);
  });

  await it("Sinh bài tập thành công -> 200 kèm draft assignment", async () => {
    aiGateway.chat = async () => ({
      status: "COMPLETED",
      data: {
        content: JSON.stringify({
          title: "Quản lý sinh viên",
          description: "Viết chương trình thêm sửa xóa sinh viên.",
          testCases: [
            { input: "1\nNam\n", expectedOutput: "Added Nam\n", scoreWeight: 50 },
            { input: "2\nHoa\n", expectedOutput: "Added Hoa\n", scoreWeight: 50 },
          ],
        }),
        model: "mock-model",
        tokenUsage: { prompt: 100, completion: 200, total: 300 },
        latencyMs: 300,
        provider: "groq",
      },
      attemptLog: [],
    });

    const { req, res, getStatus, getBody } = mockReqRes({
      topic: "Array Manipulation",
      language: "Java",
      difficulty: "medium",
    });

    await generateAssignment(req, res);
    assert.equal(getStatus(), 200);
    assert.equal(getBody().success, true);
    assert.equal(getBody().data.title, "Quản lý sinh viên");
    assert.equal(getBody().data.testCases.length, 2);
  });

  // Khôi phục gateway chat
  aiGateway.chat = originalChat;

  console.log("\n══════════════════════════════════════════════════");
  console.log(`📊 Kết quả: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

run();
