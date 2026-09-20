import { test, expect, type Page } from '@playwright/test';

/**
 * 后台管理 — 评论审核 / 优惠券 / 退款 / 弃单 的 DataTable + 分页 + 状态筛选烟测。
 *
 * 前置：管理员已登录；CI 中通过 storageState 注入 token。
 * 这里只测"接口契约 + 客户端状态机"，不依赖真实数据库内容：
 *   - 加载页面能拿到 <table> 结构
 *   - 切换 status filter 触发 fetch 并改变 URL
 *   - 搜索框输入触发 fetch
 *
 * 这些测试是冒烟，不是完整业务覆盖；它们防止"分页参数接错"、"DataTable 渲染崩"等回归。
 */

async function gotoAdmin(page: Page, path: string) {
  // 假设测试 fixture 已注入 admin token；本地开发可以用
  //   pnpm test:e2e -- --headed  手动登录后测试。
  await page.goto(`/admin${path}`);
}

test.describe('admin reviews: DataTable + status filter + search', () => {
  test('页面加载并展示表头', async ({ page }) => {
    await gotoAdmin(page, '/reviews');
    // DataTable 渲染为 <table>，首列头为"商品"
    const table = page.locator('table').first();
    await expect(table).toBeVisible();
    await expect(table.locator('th', { hasText: '商品' })).toBeVisible();
    await expect(table.locator('th', { hasText: '评分' })).toBeVisible();
    await expect(table.locator('th', { hasText: '状态' })).toBeVisible();
  });

  test('点击"待审核"按钮，URL 增加 isApproved=false 参数', async ({ page }) => {
    const reqPromise = page.waitForRequest((r) =>
      r.url().includes('/api/admin/reviews') && r.url().includes('isApproved=false'),
    );
    await gotoAdmin(page, '/reviews');
    await page.getByRole('button', { name: '待审核' }).click();
    const req = await reqPromise;
    expect(req.url()).toContain('isApproved=false');
  });

  test('搜索框输入触发分页查询', async ({ page }) => {
    const reqPromise = page.waitForRequest((r) =>
      r.url().includes('/api/admin/reviews') && r.url().includes('search='),
    );
    await gotoAdmin(page, '/reviews');
    await page.locator('input[placeholder*="搜索"]').fill('hello');
    const req = await reqPromise;
    expect(req.url()).toContain('search=hello');
  });
});

test.describe('admin coupons: DataTable + status filter + search', () => {
  test('页面加载并展示表头', async ({ page }) => {
    await gotoAdmin(page, '/coupons');
    const table = page.locator('table').first();
    await expect(table).toBeVisible();
    await expect(table.locator('th', { hasText: '优惠码' })).toBeVisible();
    await expect(table.locator('th', { hasText: '状态' })).toBeVisible();
  });

  test('点击"启用"按钮，URL 增加 isActive=true', async ({ page }) => {
    const reqPromise = page.waitForRequest((r) =>
      r.url().includes('/api/admin/coupons') && r.url().includes('isActive=true'),
    );
    await gotoAdmin(page, '/coupons');
    await page.getByRole('button', { name: '启用' }).click();
    const req = await reqPromise;
    expect(req.url()).toContain('isActive=true');
  });
});

test.describe('admin refunds: DataTable + 5 status filter + search', () => {
  test('页面加载并展示表头', async ({ page }) => {
    await gotoAdmin(page, '/refunds');
    const table = page.locator('table').first();
    await expect(table).toBeVisible();
    await expect(table.locator('th', { hasText: '订单号' })).toBeVisible();
    await expect(table.locator('th', { hasText: '退款金额' })).toBeVisible();
    await expect(table.locator('th', { hasText: '状态' })).toBeVisible();
  });

  test('点击"已通过"按钮，URL 增加 status=approved', async ({ page }) => {
    const reqPromise = page.waitForRequest((r) =>
      r.url().includes('/api/admin/refunds') && r.url().includes('status=approved'),
    );
    await gotoAdmin(page, '/refunds');
    await page.getByRole('button', { name: '已通过' }).click();
    const req = await reqPromise;
    expect(req.url()).toContain('status=approved');
  });
});

test.describe('admin abandoned-carts: DataTable + recovered filter + search', () => {
  test('页面加载并展示表头', async ({ page }) => {
    await gotoAdmin(page, '/abandoned-carts');
    const table = page.locator('table').first();
    await expect(table).toBeVisible();
    await expect(table.locator('th', { hasText: '用户/邮箱' })).toBeVisible();
    await expect(table.locator('th', { hasText: '状态' })).toBeVisible();
  });

  test('点击"已恢复"按钮，URL 增加 recovered=true', async ({ page }) => {
    const reqPromise = page.waitForRequest((r) =>
      r.url().includes('/api/admin/abandoned-carts') && r.url().includes('recovered=true'),
    );
    await gotoAdmin(page, '/abandoned-carts');
    await page.getByRole('button', { name: '已恢复' }).click();
    const req = await reqPromise;
    expect(req.url()).toContain('recovered=true');
  });
});
