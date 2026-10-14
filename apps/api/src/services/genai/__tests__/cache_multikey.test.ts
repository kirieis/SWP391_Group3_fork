import assert from "node:assert/strict";
import { computeReviewHash, getCachedReview, setCachedReview } from "../gateway.js";

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

async function run() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║    AITA GenAI — Cache & SHA-256 Unit Tests           ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  console.log("📋 1. SHA-256 Hash Computation (Việc 7)");
  await it("computeReviewHash sinh mã băm SHA-256 chuẩn (64 ký tự hex)", () => {
    const hash = computeReviewHash("print('hello')", "python");
    assert.equal(typeof hash, "string");
    assert.equal(hash.length, 64);
    assert(/^[0-9a-f]{64}$/.test(hash), "Hash phải là 64 ký tự hex");
  });

  await it("Chuẩn hóa xuống dòng CRLF và LF cho ra cùng 1 hash", () => {
    const codeLF = "def add(a, b):\n    return a + b\n";
    const codeCRLF = "def add(a, b):\r\n    return a + b\r\n";
    const hash1 = computeReviewHash(codeLF, "Python");
    const hash2 = computeReviewHash(codeCRLF, "Python");
    assert.equal(hash1, hash2, "Mã băm phải trùng nhau dù dùng CRLF hay LF");
  });

  await it("Khoảng trắng đầu/cuối được trim để đồng nhất hash", () => {
    const code1 = "console.log('hi');";
    const code2 = "   \n\n  console.log('hi');  \n\n  ";
    const hash1 = computeReviewHash(code1, "JavaScript");
    const hash2 = computeReviewHash(code2, "JavaScript");
    assert.equal(hash1, hash2, "Mã băm phải trùng nhau khi code chỉ khác khoảng trắng bao ngoài");
  });

  await it("Đổi ngôn ngữ cho ra hash hoàn toàn khác nhau", () => {
    const code = "int x = 10;";
    const hashJava = computeReviewHash(code, "Java");
    const hashCSharp = computeReviewHash(code, "C#");
    assert.notEqual(hashJava, hashCSharp, "Ngôn ngữ khác nhau phải có hash khác nhau");
  });

  await it("Code khác nhau cho ra hash khác nhau", () => {
    const hash1 = computeReviewHash("int a = 1;", "Java");
    const hash2 = computeReviewHash("int a = 2;", "Java");
    assert.notEqual(hash1, hash2, "Code khác nhau phải có hash khác nhau");
  });

  console.log("\n📋 2. Fail-Open Cache Resilience (Việc 7)");
  await it("getCachedReview trả về null an toàn khi Redis không sẵn sàng (Fail-Open)", async () => {
    const result = await getCachedReview("print(123)", "Python");
    // Có thể là null nếu không có Redis hoặc cache miss
    assert(result === null || typeof result === "object");
  });

  await it("setCachedReview không ném exception khi Redis không sẵn sàng (Fail-Open)", async () => {
    await setCachedReview("print(123)", "Python", {
      score: 95,
      feedback: "Code sạch và tối ưu.",
    });
    // Không ném lỗi là đạt yêu cầu Fail-Open
    assert(true);
  });

  console.log("\n══════════════════════════════════════════════════");
  console.log(`📊 Kết quả: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

run();
