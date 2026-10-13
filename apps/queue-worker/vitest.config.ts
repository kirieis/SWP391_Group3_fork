import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/smoke.ts",
        "src/logger.ts",
        "src/contracts/**",
        "src/clients/sandbox.client.ts",
        "src/clients/ast.client.ts",
        "src/clients/genai.client.ts",
      ],
    },
  },
});
