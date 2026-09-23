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
});

async function gotoAdmin(page: Page, path: string) {
  // beforeEach injects a real demo-admin session through the public login API.
  await page.goto(`/admin${path}`);
}

async function expectListLoaded(
  page: Page,
  path: string,
  apiPath: string,
  expectedHeaders: string[],
) {
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes(apiPath) && response.request().method() === "GET",
  );
  await gotoAdmin(page, path);
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  await expect(page.locator("body")).not.toContainText("Application error");

  // DataTable intentionally renders an EmptyState instead of an empty <table>.
  // Only assert column headers when the API returned rows and a table exists.
  const table = page.locator("table").first();
  if (await table.count()) {
    await expect(table).toBeVisible();
    for (const header of expectedHeaders) {
      await expect(table.locator("th", { hasText: header })).toBeVisible();
    }
  }
}

test.describe('admin reviews: DataTable + status filter + search', () => {
  test('页面加载并展示表头', async ({ page }) => {
    await expectListLoaded(page, "/reviews", "/api/admin/reviews", ["商品", "评分", "状态"]);
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
    await expectListLoaded(page, "/coupons", "/api/admin/coupons", ["优惠码", "状态"]);
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
    await expectListLoaded(page, "/refunds", "/api/admin/refunds", ["订单号", "退款金额", "状态"]);
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
    await expectListLoaded(page, "/abandoned-carts", "/api/admin/abandoned-carts", ["用户/邮箱", "状态"]);
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
