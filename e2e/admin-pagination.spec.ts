import { test, expect, type Page } from '@playwright/test';

/**
 * 后台管理 — 评论审核 / 优惠券 / 退款 / 弃单 的 DataTable + 分页 + 状态筛选烟测。
 *
 * 前置：beforeEach 通过应用自己的 demo-admin 登录接口建立会话。
 * 列表 API 使用稳定 mock 数据，因此 CI 不依赖真实数据库内容：
 *   - 加载页面能拿到 <table> 结构
 *   - 切换 status filter 触发 fetch 并改变 URL
 *   - 搜索框输入触发 fetch
 *
 * 这些测试是冒烟，不是完整业务覆盖；它们防止"分页参数接错"、"DataTable 渲染崩"等回归。
 */

test.beforeEach(async ({ page, request }) => {
  const response = await request.post("/api/auth/login", {
    data: {
      email: "admin@globaltrade.enterprise",
      password: "admin123",
    },
  });
  if (!response.ok()) {
    throw new Error(`E2E admin login failed: ${response.status()}`);
  }
  const payload = await response.json() as { data?: { token?: string } };
  const token = payload.data?.token;
  if (!token) {
    throw new Error("E2E admin login did not return a token");
  }
  await page.addInitScript((authToken: string) => {
    window.localStorage.setItem("tradingweb_auth_token", authToken);
  }, token);


  const json = (route: Parameters<Parameters<typeof page.route>[1]>[0], data: unknown) =>
    route.fulfill({ json: { data: [data], total: 1, page: 1, pageSize: 20 } });

  await page.route("**/api/admin/reviews?*", (route) => json(route, {
    id: "review-e2e-1",
    product_id: "product-e2e-1",
    user_id: "user-e2e-1",
    rating: 5,
    title: "E2E review",
    content: "Stable fixture",
    is_approved: false,
    created_at: "2026-09-23T00:00:00.000Z",
    product_title: "E2E Product",
  }));
  await page.route("**/api/admin/coupons?*", (route) => json(route, {
    id: "coupon-e2e-1",
    code: "E2E10",
    type: "percentage",
    value: "10",
    min_order_amount: "0",
    usage_limit: 100,
    used_count: 1,
    is_active: true,
    created_at: "2026-09-23T00:00:00.000Z",
  }));
  await page.route("**/api/admin/refunds?*", (route) => json(route, {
    id: "refund-e2e-1",
    order_id: "order-e2e-1",
    reason: "E2E fixture",
    amount: "10.00",
    status: "pending",
    restocked: false,
    created_at: "2026-09-23T00:00:00.000Z",
    orders: { order_no: "E2E-ORDER-1", total_amount: "20.00" },
  }));
  await page.route("**/api/admin/abandoned-carts?*", (route) => json(route, {
    id: "cart-e2e-1",
    user_id: "user-e2e-1",
    email: "e2e@example.com",
    items: [],
    total: "20.00",
    coupon_sent: false,
    abandoned_at: "2026-09-23T00:00:00.000Z",
  }));
});

async function gotoAdmin(page: Page, path: string) {
  // beforeEach injects a real demo-admin session through the public login API.
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
    await page.getByRole('button', { name: '启用', exact: true }).click();
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
