import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 配置
 * 用于验证 Radix UI Portal 组件在快速交互时不抛出 removeChild NotFoundError
 * 使用 next dev --webpack 模式运行（因生产构建存在未解决的 SSR 问题）
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html'], ['list']] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm exec next dev -p 3100 --webpack',
        port: 3100,
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
        stdout: 'pipe',
      },
});
