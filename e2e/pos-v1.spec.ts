import { test, expect } from '@playwright/test';
import { parsePosCheckoutRequest } from '../src/services/admin/pos-contracts';

test('production web POS verifies operator, opens shift, approves discount, prints receipt and closes shift', async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await page.addInitScript(() => localStorage.setItem('tradingweb_auth_token', 'fictional-test-token'));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    let data: unknown = null;
    if (path === '/api/auth/me') data = { id: 'user', email: 'fixture@example.com', name: 'Fixture' };
    else if (path === '/api/admin/stores') data = [{ id: 'store', name: 'Fixture Store', status: 'active' }];
    else if (path.endsWith('/bootstrap')) data = { currency: 'USD', tax_rate: '0.00', pricing_version: 'v1', payment_methods: [{ code: 'cash', label: 'Cash' }] };
    else if (path.endsWith('/catalog')) data = [{ product_id: 'product', variant_id: null, title: 'Fixture Product', variant_title: null, sku: 'SKU', barcode: null, price: 20, type: 'physical', stock: 5 }];
    else if (path.endsWith('/operator-sessions')) data = { token: `${body.staff_id}-token`, operator: { staffId: body.staff_id } };
    else if (path.endsWith('/shifts/current')) data = null;
    else if (path.endsWith('/shifts')) data = { id: 'shift' };
    else if (path.endsWith('/approvals')) {
      expect(route.request().headers()['x-pos-operator-session']).toBe('manager-token');
      expect(body.operation).toBe('checkout_discount'); data = { token: 'approval-token' };
    } else if (path.endsWith('/checkout')) {
      expect(route.request().headers()['x-pos-operator-session']).toBe('cashier-token');
      expect(route.request().headers()['x-pos-device-id']).toBeTruthy();
      const parsed = parsePosCheckoutRequest(body); requests.push(body);
      expect(parsed.pricing_preview.total).toBe('18.00');
      if (!body.approval_token) return route.fulfill({ status: 403, json: { error: { code: 'DISCOUNT_APPROVAL_REQUIRED', details: { resource_hash: 'a'.repeat(64) } } } });
      expect(body.idempotency_key).toBe(requests[0].idempotency_key);
      data = { id: 'order', order_no: 'POS-FIXTURE', created_at: new Date().toISOString(), subtotal: '20.00', discount_total: '2.00', total: '18.00', items: [{ name: 'Fixture Product', sku: 'SKU', quantity: 1, unit_price: '20.00' }] };
    } else if (path.endsWith('/close')) { expect(body.counted_cash).toBe('18.00'); data = { difference_cash: '0.00' }; }
    await route.fulfill({ json: { data } });
  });
  await page.goto('/admin/pos');
  await page.getByPlaceholder('操作员员工 ID').fill('cashier');
  await page.getByPlaceholder('操作员 PIN').fill('1234');
  await page.getByRole('button', { name: '验证操作员', exact: true }).click();
  await page.getByRole('button', { name: '开班', exact: true }).click();
  await page.getByPlaceholder('商品名称 / SKU / 扫码输入').fill('Fixture');
  await page.getByRole('button', { name: /Fixture Product/ }).click();
  await page.getByPlaceholder('整单折扣金额').fill('2');
  await page.getByRole('button', { name: '收款 $18.00', exact: true }).click();
  await page.getByPlaceholder('经理员工 ID').fill('manager');
  await page.getByPlaceholder('经理 PIN').fill('4321');
  await page.getByRole('button', { name: '审批并完成原交易' }).click();
  await expect(page.locator('#pos-receipt')).toContainText('POS-FIXTURE');
  await expect(page.locator('#pos-receipt')).toContainText('18.00');
  await page.screenshot({ path: 'test-results/pos-receipt.png', fullPage: true });
  await page.getByRole('button', { name: '新交易', exact: true }).click();
  await page.getByRole('textbox', { name: '交班实点现金' }).fill('18.00');
  await page.getByRole('button', { name: '确认交班' }).click();
  await expect(page.getByRole('button', { name: '开班', exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
});
