import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';

/**
 * Radix UI Portal 组件稳定性测试
 *
 * 验证修复后的 Portal 组件（统一使用 #radix-portal-container 容器）
 * 在快速交互场景下不会抛出 NotFoundError: removeChild。
 *
 * 测试场景：
 *  1. DropdownMenu 展开/关闭循环 10 次（导航栏货币/语言切换器）
 *  2. Select（/products 页面筛选/排序）展开 + 选择循环 5 次
 *  3. 默认 body portal 策略不会重新引入旧的专用容器
 */

interface ErrorCollector {
  errors: string[];
  pageErrors: string[];
}

function captureErrors(page: Page): ErrorCollector {
  const collector: ErrorCollector = { errors: [], pageErrors: [] };

  page.on('pageerror', (err: Error) => {
    collector.pageErrors.push(`${err.name}: ${err.message}`);
  });

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (
      text.includes('favicon') ||
      text.includes('manifest') ||
      text.includes('Failed to load resource') ||
      text.includes('net::') ||
      text.includes('ERR_')
    ) {
      return;
    }
    collector.errors.push(text);
  });

  return collector;
}

function getCriticalErrors(c: ErrorCollector): string[] {
  const all = [...c.pageErrors, ...c.errors];
  return all.filter(
    (e) =>
      e.includes('NotFoundError') ||
      e.includes('removeChild') ||
      e.includes('Application error') ||
      e.includes('client-side exception')
  );
}

test.describe('Radix Portal 组件稳定性', () => {
  test('Select 展开选择循环 5 次（products 页面）', async ({ page }) => {
    const collector = captureErrors(page);
    await page.goto('/products');

    // 等待页面加载完成，找到 Select trigger（[data-slot="select-trigger"]）
    const selectTrigger = page.locator('[data-slot="select-trigger"]').first();
    await expect(selectTrigger).toBeVisible({ timeout: 15000 });

    for (let i = 0; i < 5; i++) {
      await selectTrigger.click();
      // 等待 Select 内容出现在 Portal 中
      await page.waitForSelector('[data-slot="select-content"]', { state: 'visible', timeout: 5000 });
      // 选择第一个选项
      const firstItem = page.locator('[data-slot="select-item"]').first();
      await firstItem.click();
      // 等待 Select 关闭
      await page.waitForSelector('[data-slot="select-content"]', { state: 'hidden', timeout: 5000 });
      await page.waitForTimeout(80);
    }

    const critical = getCriticalErrors(collector);
    expect(critical, `Critical errors detected:\n${critical.join('\n')}`).toEqual([]);
  });

  test("默认使用 body portal，不创建历史专用容器", async ({ page }) => {
    const collector = captureErrors(page);
    await page.goto("/");
    await expect(page.locator("#radix-portal-container")).toHaveCount(0);
    const critical = getCriticalErrors(collector);
    expect(critical, `Critical errors detected:\n${critical.join("\n")}`).toEqual([]);
  });
});
