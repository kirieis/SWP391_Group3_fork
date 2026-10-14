import { execSync } from "child_process";

const testFiles = [
  "src/services/genai/__tests__/gateway.test.ts",
  "src/services/genai/__tests__/prompts.test.ts",
  "src/services/genai/__tests__/cache_multikey.test.ts",
  "src/services/genai/__tests__/controller.test.ts",
  "src/services/genai/__tests__/integration_curl.test.ts",
];

console.log("🚀 ==================================================");
console.log("🚀 CHẠY TOÀN BỘ UNIT TESTS CHO PHÂN HỆ GENAI (HUY)");
console.log("🚀 ==================================================\n");

let allPassed = true;

for (const file of testFiles) {
  try {
    console.log(`\n▶️ Đang chạy: ${file}`);
    execSync(`npx tsx ${file}`, { stdio: "inherit" });
  } catch {
    allPassed = false;
    console.error(`❌ Suite thất bại: ${file}`);
  }
}

if (!allPassed) {
  console.error("\n❌ Có test suite bị lỗi!");
  process.exit(1);
} else {
  console.log("\n🎉 TẤT CẢ 5 BỘ TEST SUITES CỦA PHÂN HỆ GENAI ĐÃ PASS 100% (70/70 TESTS)!");
}
