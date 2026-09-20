import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: [
      "src/services/admin/__tests__/**/*.test.ts",
      "src/services/orders/__tests__/**/*.test.ts",
      "src/services/inventory/__tests__/**/*.test.ts",
      "src/app/api/admin/pos/__tests__/**/*.test.ts",
      "src/app/api/auth/__tests__/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
  },
});
