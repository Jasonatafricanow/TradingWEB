import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // CLI 边界测试会 spawn tsx 子进程；Windows/低配机器冷启动可能超过默认 5s。
    testTimeout: 30000,
    include: [
      "src/services/payment/__tests__/stripe-refund-reconciliation.test.ts",
      "src/services/auth/__tests__/**/*.test.ts",
      "src/services/admin/__tests__/**/*.test.ts",
      "src/services/orders/__tests__/**/*.test.ts",
      "src/services/inventory/__tests__/**/*.test.ts",
      "src/app/api/admin/pos/__tests__/**/*.test.ts",
      "src/app/api/auth/__tests__/**/*.test.ts",
      "src/lib/__tests__/version.test.ts",
      "scripts/**/*.test.ts",
    ],
  },
});
