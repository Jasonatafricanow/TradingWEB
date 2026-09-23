import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';

/**
 * Radix UI Portal 组件稳定性测试
 *
 * 验证当前 Portal 策略：Radix 使用默认 document.body portal，
 * 快速交互不抛出 NotFoundError: removeChild，同时不重新引入历史
 * #radix-portal-container stacking-context 问题。
 *
 * 测试场景：
 *  1. Select（/products 页面筛选/排序）展开 + 选择循环 5 次
 *  2. 页面不注入已废弃的自定义 Portal 容器
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

  test('使用默认 body portal，不注入历史自定义容器', async ({ page }) => {
    await page.goto('/products');
    const selectTrigger = page.locator('[data-slot="select-trigger"]').first();
    await expect(selectTrigger).toBeVisible({ timeout: 15000 });
    await selectTrigger.click();
    await expect(page.locator('[data-slot="select-content"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#radix-portal-container')).toHaveCount(0);
  });
});
