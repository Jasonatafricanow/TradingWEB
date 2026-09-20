/**
 * POS 有库实测(P3 合并前验收)
 *
 * 前置:一个可用的 MySQL 空库(已执行全部 drizzle 迁移或 drizzle-kit push),
 * DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME 指向它。
 *
 * 用法:pnpm tsx scripts/pos-integration-test.ts
 *
 * 覆盖:
 * 1. catalog 搜索口径(门店行 + 未归属行,排除其他门店 / variant 行)
 * 2. 现金结账:orders(source='pos')、order_items、库存扣减(多行摊扣)、
 *    inventory_transactions、order_timeline、inventory ledger
 * 3. 门店隔离:A 店不能卖 B 店库存
 * 4. 库存不足:整单回滚,不产生任何订单/明细/流水/库存变化
 */
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { searchPosCatalog, posCheckout, getPosDailyReport } from '@/services/admin/pos-service';
import { createOperatorSession, requirePosOperatorSession } from '@/services/admin/pos-operator-session-service';
import { hashPosPin } from '@/services/admin/pos-operator-crypto';
import { issueApprovalToken } from '@/services/admin/pos-approval-service';
import { hashPosRequest } from '@/services/admin/pos-contracts';
import { exchangePosOrder } from '@/services/admin/pos-exchange-service';
import { refundPosOrder } from '@/services/admin/refund-service';
import { closeShift, getCurrentShift, openShift, recordCashMovement } from '@/services/admin/pos-shift-service';
import { dispatchAuditOutbox } from '@/services/admin/pos-audit-outbox-service';

const results: { name: string; pass: boolean; detail?: string }[] = [];
function check(name: string, cond: boolean, detail?: string) {
  results.push({ name, pass: cond, detail: cond ? undefined : detail });
  console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${name}${cond ? '' : ` — ${detail}`}`);
}

type SqlParam = string | number | null;

async function q(sqlStr: string, params: SqlParam[] = []): Promise<Record<string, unknown>[]> {
  const [rows] = await db.$client.execute(sqlStr, params);
  return rows as Record<string, unknown>[];
}

async function count(sqlStr: string, params: SqlParam[] = []): Promise<number> {
  const rows = await q(sqlStr, params);
  return Number(rows[0]?.cnt ?? 0);
}

async function main() {
  const dbName = process.env.DB_NAME ?? '';
  if (!/(?:_test|_tmp)(?:$|_)/i.test(dbName)) {
    console.error(`BLOCKED: DB_NAME must contain an explicit disposable marker (_test or _tmp); received ${dbName || '<empty>'}`);
    process.exit(2);
  }
  const sfx = Date.now().toString(36);
  const catId = randomUUID();
  const storeA = randomUUID();
  const storeB = randomUUID();
  const plainId = randomUUID();
  const varProdId = randomUUID();
  const v1 = randomUUID();
  const v2 = randomUUID();
  const accountUserId = randomUUID();
  const operatorStaffId = randomUUID();
  const managerStaffId = randomUUID();
  const operatorPin = '246810';

  console.log('── seed ──');
  await q(`INSERT INTO categories (id, name, type) VALUES (?, ?, 'physical')`, [catId, `POS测试类目${sfx}`]);
  const storeMetadata = JSON.stringify({ currency: 'USD', tax: '0.00', pricing_version: 'pos-v1' });
  await q(`INSERT INTO stores (id, name, status, type, metadata) VALUES (?, ?, 'active', 'permanent', ?)`, [storeA, `POS测试A店${sfx}`, storeMetadata]);
  await q(`INSERT INTO stores (id, name, status, type, metadata) VALUES (?, ?, 'active', 'permanent', ?)`, [storeB, `POS测试B店${sfx}`, storeMetadata]);
  await q(`INSERT INTO users (id, email, name, is_active) VALUES (?, ?, ?, TRUE)`, [accountUserId, `pos-${sfx}@example.test`, `POS Account ${sfx}`]);
  await q(
    `INSERT INTO staff (id, user_id, store_id, role, name, email, is_active, pos_enabled, pos_pin_hash, pos_permissions)
     VALUES (?, ?, ?, 'operator', ?, ?, TRUE, TRUE, ?, ?)`,
    [operatorStaffId, accountUserId, storeA, `POS Operator ${sfx}`, `staff-${sfx}@example.test`, hashPosPin(operatorPin), JSON.stringify(['checkout', 'refund', 'exchange'])],
  );
  await q(
    `INSERT INTO staff (id, store_id, role, name, email, is_active) VALUES (?, ?, 'manager', ?, ?, TRUE)`,
    [managerStaffId, storeA, `POS Manager ${sfx}`, `manager-${sfx}@example.test`],
  );
  await q(
    `INSERT INTO payment_methods (id, code, name, type, enabled, sort_order) VALUES (?, 'cash', 'Cash', 'offline_manual', TRUE, 1)
     ON DUPLICATE KEY UPDATE enabled = TRUE`,
    [randomUUID()],
  );
  await q(
    `INSERT INTO payment_methods (id, code, name, type, enabled, sort_order) VALUES (?, 'card', 'Card', 'offline_manual', TRUE, 2)
     ON DUPLICATE KEY UPDATE enabled = TRUE`,
    [randomUUID()],
  );

  const issuedSession = await createOperatorSession({
    accountUserId,
    staffId: operatorStaffId,
    storeId: storeA,
    deviceId: `android-test-${sfx}`,
    pin: operatorPin,
  });
  const operator = await requirePosOperatorSession(new Request('https://pos.test', { headers: {
    'X-POS-Operator-Session': issuedSession.token,
    'X-POS-Device-ID': `android-test-${sfx}`,
  } }), accountUserId);

  // 无变体实物商品:A 店 10 + 未归属 4 + B 店 50(B 店的不许动)
  await q(
    `INSERT INTO products (id, title, price, category_id, type, seller_id, status) VALUES (?, ?, '25.00', ?, 'physical', 'seller-test', 'active')`,
    [plainId, `POS普通商品${sfx}`, catId]
  );
  await q(`INSERT INTO inventory (id, product_id, store_id, stock, low_stock_threshold) VALUES (?, ?, ?, 10, 0)`, [randomUUID(), plainId, storeA]);
  await q(`INSERT INTO inventory (id, product_id, stock, low_stock_threshold) VALUES (?, ?, 4, 0)`, [randomUUID(), plainId]);
  await q(`INSERT INTO inventory (id, product_id, store_id, stock, low_stock_threshold) VALUES (?, ?, ?, 50, 0)`, [randomUUID(), plainId, storeB]);

  // 变体商品:v1 有本店和其他门店行账;v2 使用未归属行账。
  await q(
    `INSERT INTO products (id, title, price, category_id, type, seller_id, status) VALUES (?, ?, '30.00', ?, 'physical', 'seller-test', 'active')`,
    [varProdId, `POS变体商品${sfx}`, catId]
  );
  await q(`INSERT INTO product_variants (id, product_id, title, sku, price, stock) VALUES (?, ?, '红色', ?, '30.00', 100)`, [v1, varProdId, `POSSKU1${sfx}`]);
  await q(`INSERT INTO product_variants (id, product_id, title, sku, price, stock) VALUES (?, ?, '蓝色', ?, '40.00', 7)`, [v2, varProdId, `POSSKU2${sfx}`]);
  await q(`INSERT INTO inventory (id, product_id, variant_id, store_id, stock, low_stock_threshold) VALUES (?, ?, ?, ?, 5, 0)`, [randomUUID(), varProdId, v1, storeA]);
  await q(`INSERT INTO inventory (id, product_id, variant_id, store_id, stock, low_stock_threshold) VALUES (?, ?, ?, ?, 99, 0)`, [randomUUID(), varProdId, v1, storeB]);
  await q(`INSERT INTO inventory (id, product_id, variant_id, stock, low_stock_threshold) VALUES (?, ?, ?, 7, 0)`, [randomUUID(), varProdId, v2]);

  console.log('── 1. catalog 搜索口径 ──');
  const plainHits = await searchPosCatalog(`POS普通商品${sfx}`, storeA);
  check('普通商品可搜到', plainHits.length === 1, `hits=${plainHits.length}`);
  check('普通商品库存 = A店10 + 未归属4 = 14(不含B店50)', plainHits[0]?.stock === 14, `stock=${plainHits[0]?.stock}`);

  const v1Hits = await searchPosCatalog(`POSSKU1${sfx}`, storeA);
  check('SKU 精确搜到变体 v1', v1Hits[0]?.variant_id === v1, `first=${v1Hits[0]?.variant_id}`);
  check('v1 库存 = A店行账 5(不回退全局100,不含B店99)', v1Hits[0]?.stock === 5, `stock=${v1Hits[0]?.stock}`);

  const v2Hits = await searchPosCatalog(`POSSKU2${sfx}`, storeA);
  check('v2 未归属行账为 7', v2Hits[0]?.stock === 7, `stock=${v2Hits[0]?.stock}`);

  console.log('── 2. Android V1 拆分支付结账 ──');
  const checkoutRequest = {
    idempotency_key: `test-checkout-${sfx}`,
    store_id: storeA,
    currency: 'USD',
    staff_id: operatorStaffId,
    customer_id: null,
    note: 'integration checkout',
    fulfillment: { method: 'in_store' as const },
    items: [
      { product_id: plainId, variant_id: null, quantity: 12, line_discount: '0.00' },
      { product_id: varProdId, variant_id: v1, quantity: 2, line_discount: '0.00' },
      { product_id: varProdId, variant_id: v2, quantity: 1, line_discount: '0.00' },
    ],
    order_discount: '5.00',
    pricing_preview: { subtotal: '400.00', discount: '5.00', tax: '0.00', total: '395.00' },
    pricing_version: 'pos-v1',
    payments: [
      { method: 'cash', label: 'Cash', amount: '100.00', reference: null },
      { method: 'card', label: 'Card', amount: '295.00', reference: 'TERM-1' },
    ],
    account_user_id: accountUserId,
    operator,
  };
  const receipt = await posCheckout(checkoutRequest);
  const orderId = receipt.id;
  check('小票小计 = 12×25 + 2×30 + 1×40 = 400', receipt.subtotal === '400.00', receipt.subtotal);
  check('小票合计 = 395(折扣5)', receipt.total === '395.00', receipt.total);

  const [order] = await q(`SELECT * FROM orders WHERE id = ?`, [orderId]);
  check("orders.source = 'pos'", order?.source === 'pos', String(order?.source));
  check('orders.store_id = A店', order?.store_id === storeA);
  check("orders.status = 'completed'", order?.status === 'completed', String(order?.status));
  check("orders.payment_status = 'paid'", order?.payment_status === 'paid', String(order?.payment_status));
  check("orders.fulfillment_status = 'fulfilled'", order?.fulfillment_status === 'fulfilled', String(order?.fulfillment_status));
  check("orders.payment_method = 'split'", order?.payment_method === 'split', String(order?.payment_method));
  check('orders.total_amount = 395.00', Number(order?.total_amount) === 395, String(order?.total_amount));

  check('order_items 3 行', (await count(`SELECT COUNT(*) as cnt FROM order_items WHERE order_id = ?`, [orderId])) === 3);
  check('order_payments 2 条拆分支付记录', (await count(
    `SELECT COUNT(*) as cnt FROM order_payments WHERE order_id = ? AND channel = 'pos'`,
    [orderId],
  )) === 2);
  const replayCountsBefore = {
    orders: await count(`SELECT COUNT(*) as cnt FROM orders WHERE id = ?`, [orderId]),
    payments: await count(`SELECT COUNT(*) as cnt FROM order_payments WHERE order_id = ?`, [orderId]),
    inventory: await count(`SELECT COUNT(*) as cnt FROM inventory_transactions WHERE reference_id = ?`, [orderId]),
    timeline: await count(`SELECT COUNT(*) as cnt FROM order_timeline WHERE order_id = ?`, [orderId]),
  };
  const replay = await posCheckout(checkoutRequest);
  const replayCountsAfter = {
    orders: await count(`SELECT COUNT(*) as cnt FROM orders WHERE id = ?`, [orderId]),
    payments: await count(`SELECT COUNT(*) as cnt FROM order_payments WHERE order_id = ?`, [orderId]),
    inventory: await count(`SELECT COUNT(*) as cnt FROM inventory_transactions WHERE reference_id = ?`, [orderId]),
    timeline: await count(`SELECT COUNT(*) as cnt FROM order_timeline WHERE order_id = ?`, [orderId]),
  };
  check('相同请求幂等重放返回同一订单', replay.id === orderId, replay.id);
  check('幂等重放不增加任何记录', JSON.stringify(replayCountsAfter) === JSON.stringify(replayCountsBefore), JSON.stringify(replayCountsAfter));
  let keyReuseRejected = false;
  try {
    await posCheckout({
      ...checkoutRequest,
      payments: [
        { method: 'cash', label: 'Cash', amount: '99.00', reference: null },
        { method: 'card', label: 'Card', amount: '296.00', reference: 'TERM-1' },
      ],
    });
  } catch (error) {
    keyReuseRejected = (error as { code?: string }).code === 'IDEMPOTENCY_KEY_REUSED';
  }
  check('同键不同请求返回幂等冲突', keyReuseRejected);
  let forgedOperatorRejected = false;
  try {
    await posCheckout({ ...checkoutRequest, idempotency_key: `test-forged-${sfx}`, staff_id: randomUUID() });
  } catch (error) {
    forgedOperatorRejected = (error as { code?: string }).code === 'OPERATOR_MISMATCH';
  }
  check('伪造 staff/store 身份返回 403 语义', forgedOperatorRejected);

  const invPlain = await q(`SELECT store_id, stock FROM inventory WHERE product_id = ? AND variant_id IS NULL ORDER BY stock`, [plainId]);
  const plainA = invPlain.find((r) => r.store_id === storeA);
  const plainNull = invPlain.find((r) => !r.store_id);
  const plainB = invPlain.find((r) => r.store_id === storeB);
  check('普通商品 A店行 10→0(先扣门店)', Number(plainA?.stock) === 0, `A=${plainA?.stock}`);
  check('普通商品 未归属行 4→2(摊扣剩余)', Number(plainNull?.stock) === 2, `null=${plainNull?.stock}`);
  check('普通商品 B店行 50 不动', Number(plainB?.stock) === 50, `B=${plainB?.stock}`);

  const invV1 = await q(`SELECT store_id, stock FROM inventory WHERE variant_id = ?`, [v1]);
  const v1A = invV1.find((r) => r.store_id === storeA);
  const v1B = invV1.find((r) => r.store_id === storeB);
  check('v1 A店行 5→3', Number(v1A?.stock) === 3, `A=${v1A?.stock}`);
  check('v1 B店行 99 不动', Number(v1B?.stock) === 99, `B=${v1B?.stock}`);

  const [v2Inventory] = await q(`SELECT stock FROM inventory WHERE variant_id = ? AND store_id IS NULL`, [v2]);
  check('v2 未归属行 7→6', Number(v2Inventory?.stock) === 6, `stock=${v2Inventory?.stock}`);
  const [v1Row] = await q(`SELECT stock FROM product_variants WHERE id = ?`, [v1]);
  const [v2Row] = await q(`SELECT stock FROM product_variants WHERE id = ?`, [v2]);
  check('v1 legacy stock 不再由运行时路径改写', Number(v1Row?.stock) === 100, `stock=${v1Row?.stock}`);
  check('v2 legacy stock 不再由运行时路径改写', Number(v2Row?.stock) === 7, `stock=${v2Row?.stock}`);

  const txns = await q(
    `SELECT type, quantity, before_stock, after_stock FROM inventory_transactions WHERE reference_type='order' AND reference_id = ? ORDER BY before_stock`,
    [orderId]
  );
  check('库存流水 3 条 out,reference=order', txns.length === 3 && txns.every((t) => t.type === 'out'), `n=${txns.length}`);
  check('流水 before/after 正确(5→3 / 7→6 / 14→2)',
    JSON.stringify(txns.map((t) => [Number(t.before_stock), Number(t.after_stock)])) === JSON.stringify([[5, 3], [7, 6], [14, 2]]),
    JSON.stringify(txns));

  check("order_timeline 有 pos_sale", (await count(`SELECT COUNT(*) as cnt FROM order_timeline WHERE order_id = ? AND action = 'pos_sale'`, [orderId])) === 1);

  console.log('── 3. 门店隔离 ──');
  let isolated = false;
  try {
    await posCheckout({
      idempotency_key: `test-isolation-${sfx}`,
      store_id: storeA,
      currency: 'USD',
      staff_id: operatorStaffId,
      customer_id: null,
      note: null,
      fulfillment: { method: 'in_store' },
      items: [{ product_id: varProdId, variant_id: v1, quantity: 4, line_discount: '0.00' }], // A 店只剩 3,B 店有 99
      order_discount: '0.00',
      pricing_preview: { subtotal: '120.00', discount: '0.00', tax: '0.00', total: '120.00' },
      pricing_version: 'pos-v1',
      payments: [{ method: 'cash', label: 'Cash', amount: '120.00', reference: null }],
      account_user_id: accountUserId,
      operator,
    });
  } catch (e) {
    isolated = (e as { code?: string }).code === 'INSUFFICIENT_INVENTORY';
  }
  check('A 店可用 3、买 4 失败(B 店 99 不可用)', isolated);

  console.log('── 4. 库存不足整单回滚 ──');
  const ordersBefore = await count(`SELECT COUNT(*) as cnt FROM orders WHERE source = 'pos'`);
  const txnsBefore = await count(`SELECT COUNT(*) as cnt FROM inventory_transactions`);
  let rolledBack = false;
  try {
    await posCheckout({
      idempotency_key: `test-rollback-${sfx}`,
      store_id: storeA,
      currency: 'USD',
      staff_id: operatorStaffId,
      customer_id: null,
      note: null,
      fulfillment: { method: 'in_store' },
      items: [
        { product_id: varProdId, variant_id: v1, quantity: 1, line_discount: '0.00' }, // 这条本可成功
        { product_id: plainId, variant_id: null, quantity: 999, line_discount: '0.00' }, // 这条必失败
      ],
      order_discount: '0.00',
      pricing_preview: { subtotal: '25005.00', discount: '0.00', tax: '0.00', total: '25005.00' },
      pricing_version: 'pos-v1',
      payments: [{ method: 'cash', label: 'Cash', amount: '25005.00', reference: null }],
      account_user_id: accountUserId,
      operator,
    });
  } catch (e) {
    rolledBack = (e as { code?: string }).code === 'INSUFFICIENT_INVENTORY';
  }
  check('混合购物车结账抛错', rolledBack);
  check('订单数不变(没有半成品订单)', (await count(`SELECT COUNT(*) as cnt FROM orders WHERE source = 'pos'`)) === ordersBefore);
  check('流水数不变', (await count(`SELECT COUNT(*) as cnt FROM inventory_transactions`)) === txnsBefore);
  const [v1AfterRb] = await q(`SELECT stock FROM inventory WHERE variant_id = ? AND store_id = ?`, [v1, storeA]);
  check('v1 A店行仍为 3(第一条已扣的被回滚)', Number(v1AfterRb?.stock) === 3, `stock=${v1AfterRb?.stock}`);
  const [v1GlobalRb] = await q(`SELECT stock FROM product_variants WHERE id = ?`, [v1]);
  check('v1 legacy stock 仍为 100', Number(v1GlobalRb?.stock) === 100, `stock=${v1GlobalRb?.stock}`);

  console.log('── 5. 门店日结(P3-04) ──');
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const report = await getPosDailyReport(storeA, today);
  check('日结单数 = 1(回滚单不计入)', report.order_count === 1, `count=${report.order_count}`);
  check('日结总额 = 395', report.total_amount === 395, `total=${report.total_amount}`);
  check('拆分支付渠道 = 1 单 395', report.by_payment_method.length === 1 && report.by_payment_method[0].method === 'split' && report.by_payment_method[0].amount === 395,
    JSON.stringify(report.by_payment_method));
  check('明细含该单号', report.orders.some((o) => o.order_no === receipt.order_no));

  // ── 汇总 ──
  console.log('--- 6. Task 8 refund / exchange atomicity ---');
  const simpleCheckout = async (key: string) => posCheckout({
    idempotency_key: key,
    store_id: storeA,
    currency: 'USD',
    staff_id: operatorStaffId,
    customer_id: null,
    note: null,
    fulfillment: { method: 'in_store' as const },
    items: [{ product_id: plainId, variant_id: null, quantity: 1, line_discount: '0.00' }],
    order_discount: '0.00',
    pricing_preview: { subtotal: '25.00', discount: '0.00', tax: '0.00', total: '25.00' },
    pricing_version: 'pos-v1',
    payments: [{ method: 'cash', label: 'Cash', amount: '25.00', reference: null }],
    account_user_id: accountUserId,
    operator,
  });

  const refundOrder = await simpleCheckout(`test-refund-order-${sfx}`);
  const refundResource = {
    idempotency_key: `test-refund-${sfx}`,
    store_id: storeA,
    order_id: refundOrder.id,
    return_items: [{ order_item_id: refundOrder.items[0].id, quantity: 1, restock: true }],
    reason: 'Task 8 integration return',
  };
  const refundApproval = await issueApprovalToken({
    approvedByStaffId: managerStaffId,
    storeId: storeA,
    operation: 'refund',
    resourceHash: hashPosRequest(refundResource),
  });
  const refundInput = { ...refundResource, approval_token: refundApproval.token, account_user_id: accountUserId, operator };
  const refundResult = await refundPosOrder(refundInput);
  check('refund amount uses authoritative order allocation', refundResult.amount === '25.00', refundResult.amount);
  check('pos_refund_items stores the immutable returned quantity', (await count(
    `SELECT COUNT(*) cnt FROM pos_refund_items WHERE refund_id = ? AND order_item_id = ? AND quantity = 1`,
    [refundResult.refund_id, refundOrder.items[0].id],
  )) === 1);
  let duplicateRefundBlocked = false;
  const duplicateResource = { ...refundResource, idempotency_key: `test-refund-duplicate-${sfx}` };
  const duplicateApproval = await issueApprovalToken({
    approvedByStaffId: managerStaffId,
    storeId: storeA,
    operation: 'refund',
    resourceHash: hashPosRequest(duplicateResource),
  });
  try {
    await refundPosOrder({ ...duplicateResource, approval_token: duplicateApproval.token, account_user_id: accountUserId, operator });
  } catch (error) {
    duplicateRefundBlocked = (error as { code?: string }).code === 'RETURN_QUANTITY_EXCEEDED';
  }
  check('second refund is blocked by pos_refund_items remaining quantity', duplicateRefundBlocked);

  const exchangeOrder = await simpleCheckout(`test-exchange-order-${sfx}`);
  const replacement = {
    idempotency_key: `test-exchange-replacement-${sfx}`,
    store_id: storeA,
    currency: 'USD',
    staff_id: operatorStaffId,
    customer_id: null,
    note: null,
    fulfillment: { method: 'in_store' as const },
    items: [{ product_id: varProdId, variant_id: v1, quantity: 1, line_discount: '0.00' }],
    order_discount: '0.00',
    pricing_preview: { subtotal: '30.00', discount: '0.00', tax: '0.00', total: '30.00' },
    pricing_version: 'pos-v1',
    payments: [{ method: 'cash', label: 'Cash', amount: '30.00', reference: null }],
  };
  const exchangeResource = {
    idempotency_key: `test-exchange-${sfx}`,
    store_id: storeA,
    original_order_id: exchangeOrder.id,
    return_items: [{ order_item_id: exchangeOrder.items[0].id, quantity: 1, restock: true }],
    replacement,
    difference_payment: [{ method: 'cash', label: 'Cash', amount: '5.00', reference: null }],
  };
  const exchangeApproval = await issueApprovalToken({
    approvedByStaffId: managerStaffId,
    storeId: storeA,
    operation: 'exchange',
    resourceHash: hashPosRequest(exchangeResource),
  });
  const exchangeInput = { ...exchangeResource, approval_token: exchangeApproval.token, account_user_id: accountUserId, operator };
  const exchangeResult = await exchangePosOrder(exchangeInput);
  check('atomic exchange records refund/new/difference amounts',
    exchangeResult.refund_amount === '25.00' && exchangeResult.new_order_amount === '30.00' && exchangeResult.difference_amount === '5.00',
    JSON.stringify(exchangeResult));
  check('atomic exchange writes one header', (await count(`SELECT COUNT(*) cnt FROM pos_exchanges WHERE id = ?`, [exchangeResult.exchange_id])) === 1);
  const exchangeReplay = await exchangePosOrder(exchangeInput);
  check('response-loss replay returns the same exchange', exchangeReplay.exchange_id === exchangeResult.exchange_id, exchangeReplay.exchange_id);
  check('exchange replay does not duplicate replacement order', (await count(
    `SELECT COUNT(*) cnt FROM orders WHERE client_ref = ?`, [replacement.idempotency_key],
  )) === 1);

  const rollbackOrder = await simpleCheckout(`test-exchange-rollback-order-${sfx}`);
  const [stockBeforeRollback] = await q(`SELECT stock FROM inventory WHERE product_id = ? AND store_id = ? AND variant_id IS NULL`, [plainId, storeA]);
  const rollbackCounts = {
    refunds: await count(`SELECT COUNT(*) cnt FROM refunds WHERE order_id = ?`, [rollbackOrder.id]),
    exchanges: await count(`SELECT COUNT(*) cnt FROM pos_exchanges WHERE original_order_id = ?`, [rollbackOrder.id]),
    orders: await count(`SELECT COUNT(*) cnt FROM orders WHERE source = 'pos'`),
  };
  const rollbackReplacement = {
    ...replacement,
    idempotency_key: `test-exchange-rollback-replacement-${sfx}`,
    items: [{ product_id: plainId, variant_id: null, quantity: 999, line_discount: '0.00' }],
    pricing_preview: { subtotal: '24975.00', discount: '0.00', tax: '0.00', total: '24975.00' },
    payments: [{ method: 'cash', label: 'Cash', amount: '24975.00', reference: null }],
  };
  const rollbackResource = {
    idempotency_key: `test-exchange-rollback-${sfx}`,
    store_id: storeA,
    original_order_id: rollbackOrder.id,
    return_items: [{ order_item_id: rollbackOrder.items[0].id, quantity: 1, restock: true }],
    replacement: rollbackReplacement,
    difference_payment: [{ method: 'cash', label: 'Cash', amount: '24950.00', reference: null }],
  };
  const rollbackApproval = await issueApprovalToken({
    approvedByStaffId: managerStaffId,
    storeId: storeA,
    operation: 'exchange',
    resourceHash: hashPosRequest(rollbackResource),
  });
  let exchangeRolledBack = false;
  try {
    await exchangePosOrder({ ...rollbackResource, approval_token: rollbackApproval.token, account_user_id: accountUserId, operator });
  } catch (error) {
    exchangeRolledBack = (error as { code?: string }).code === 'INSUFFICIENT_INVENTORY';
  }
  check('replacement inventory failure is propagated', exchangeRolledBack);
  check('failed exchange creates no refund/header/replacement order',
    (await count(`SELECT COUNT(*) cnt FROM refunds WHERE order_id = ?`, [rollbackOrder.id])) === rollbackCounts.refunds
      && (await count(`SELECT COUNT(*) cnt FROM pos_exchanges WHERE original_order_id = ?`, [rollbackOrder.id])) === rollbackCounts.exchanges
      && (await count(`SELECT COUNT(*) cnt FROM orders WHERE source = 'pos'`)) === rollbackCounts.orders);
  const [stockAfterRollback] = await q(`SELECT stock FROM inventory WHERE product_id = ? AND store_id = ? AND variant_id IS NULL`, [plainId, storeA]);
  check('failed exchange rolls back returned and replacement stock', Number(stockAfterRollback?.stock) === Number(stockBeforeRollback?.stock),
    `before=${stockBeforeRollback?.stock},after=${stockAfterRollback?.stock}`);

  console.log('--- 7. Task 10 shift lifecycle and outbox response-loss recovery ---');
  const lifecycleProductId = randomUUID();
  await q(
    `INSERT INTO products (id, title, price, category_id, type, seller_id, status) VALUES (?, ?, '25.00', ?, 'physical', 'seller-test', 'active')`,
    [lifecycleProductId, `POS Task10 lifecycle ${sfx}`, catId],
  );
  await q(`INSERT INTO inventory (id, product_id, store_id, stock, low_stock_threshold) VALUES (?, ?, ?, 10, 0)`,
    [randomUUID(), lifecycleProductId, storeA]);

  const opened = await openShift({ opening_float: '100.00', operator });
  const recovered = await getCurrentShift({ operator });
  check('current-shift recovery returns the authenticated store shift',
    recovered?.id === opened.id && recovered.store_id === storeA, JSON.stringify(recovered));

  const lifecycleCheckout = (key: string, method: 'cash' | 'card') => posCheckout({
    idempotency_key: key,
    store_id: storeA,
    currency: 'USD',
    staff_id: operatorStaffId,
    customer_id: null,
    note: `Task 10 ${method} sale`,
    fulfillment: { method: 'in_store' as const },
    items: [{ product_id: lifecycleProductId, variant_id: null, quantity: 1, line_discount: '0.00' }],
    order_discount: '0.00',
    pricing_preview: { subtotal: '25.00', discount: '0.00', tax: '0.00', total: '25.00' },
    pricing_version: 'pos-v1',
    payments: [{ method, label: method === 'cash' ? 'Cash' : 'Card', amount: '25.00', reference: method === 'card' ? `TERM-${sfx}` : null }],
    account_user_id: accountUserId,
    operator,
  });
  const lifecycleCashSale = await lifecycleCheckout(`task10-cash-${sfx}`, 'cash');
  const lifecycleCardSale = await lifecycleCheckout(`task10-card-${sfx}`, 'card');
  const lifecycleRefundResource = {
    idempotency_key: `task10-refund-${sfx}`,
    store_id: storeA,
    order_id: lifecycleCashSale.id,
    return_items: [{ order_item_id: lifecycleCashSale.items[0].id, quantity: 1, restock: true }],
    reason: 'Task 10 ordinary cash refund',
  };
  const lifecycleRefundApproval = await issueApprovalToken({
    approvedByStaffId: managerStaffId,
    storeId: storeA,
    operation: 'refund',
    resourceHash: hashPosRequest(lifecycleRefundResource),
  });
  const lifecycleRefund = await refundPosOrder({
    ...lifecycleRefundResource,
    approval_token: lifecycleRefundApproval.token,
    account_user_id: accountUserId,
    operator,
  });
  await recordCashMovement({
    shift_id: opened.id, kind: 'in', amount: '20.00', reason: 'Task 10 cash in',
    idempotency_key: `task10-cash-in-${sfx}`, operator,
  });
  await recordCashMovement({
    shift_id: opened.id, kind: 'out', amount: '5.00', reason: 'Task 10 cash out',
    idempotency_key: `task10-cash-out-${sfx}`, operator,
  });

  check('cash and card sales are linked to the open shift', (await count(
    `SELECT COUNT(*) cnt FROM orders WHERE id IN (?, ?) AND shift_id = ?`,
    [lifecycleCashSale.id, lifecycleCardSale.id, opened.id],
  )) === 2);
  check('ordinary cash refund is linked to the open shift', (await count(
    `SELECT COUNT(*) cnt FROM refunds WHERE id = ? AND shift_id = ? AND status = 'completed'`,
    [lifecycleRefund.refund_id, opened.id],
  )) === 1);

  const closed = await closeShift({
    shift_id: opened.id,
    counted_cash: '115.00',
    idempotency_key: `task10-close-${sfx}`,
    operator,
  });
  check('server close reconciles detail ledger: 100 + 25 - 25 + 20 - 5 = 115',
    closed.expected_cash === '115.00' && closed.difference_cash === '0.00'
      && closed.reconciliation.cash_sales === '25.00'
      && closed.reconciliation.cash_refunds === '25.00'
      && closed.reconciliation.cash_in === '20.00'
      && closed.reconciliation.cash_out === '5.00',
    JSON.stringify(closed));
  check('closed shift no longer appears as current', (await getCurrentShift({ operator })) === null);

  const responseLossOutboxId = randomUUID();
  await q(
    `INSERT INTO pos_audit_outbox
       (id, event_type, entity_type, entity_id, store_id, operator_id, payload, status, attempts)
     VALUES (?, 'pos.task10.response_loss', 'shift', ?, ?, ?, ?, 'pending', 0)`,
    [responseLossOutboxId, opened.id, storeA, operatorStaffId, JSON.stringify({ shift_id: opened.id })],
  );
  const responseLossEvent = {
    id: responseLossOutboxId,
    eventType: 'pos.task10.response_loss',
    entityType: 'shift',
    entityId: opened.id,
    storeId: storeA,
    operatorId: operatorStaffId,
    payload: { shift_id: opened.id },
    attempts: 0,
  };
  let failProcessedMarker = true;
  const dispatcherDependencies = {
    listDueEvents: async () => {
      const [row] = await q(`SELECT status, attempts FROM pos_audit_outbox WHERE id = ?`, [responseLossOutboxId]);
      if (row?.status !== 'pending') return [];
      return [{ ...responseLossEvent, attempts: Number(row.attempts) }];
    },
    insertAuditLog: async (event: typeof responseLossEvent) => {
      await q(
        `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)`,
        [event.id, event.operatorId, event.eventType, event.entityType, event.entityId,
          JSON.stringify({ ...event.payload, pos_audit_outbox_id: event.id, store_id: event.storeId })],
      );
    },
    markProcessed: async (id: string, processedAt: Date) => {
      if (failProcessedMarker) {
        failProcessedMarker = false;
        throw new Error('simulated processed marker failure');
      }
      await q(`UPDATE pos_audit_outbox SET status = 'processed', processed_at = ?, next_attempt_at = NULL WHERE id = ?`,
        [processedAt.toISOString().slice(0, 23).replace('T', ' '), id]);
    },
    markFailed: async (id: string, attempts: number, nextAttemptAt: Date) => {
      await q(`UPDATE pos_audit_outbox SET attempts = ?, next_attempt_at = ? WHERE id = ?`,
        [attempts, nextAttemptAt.toISOString().slice(0, 23).replace('T', ' '), id]);
    },
  };
  const firstDispatch = await dispatchAuditOutbox({ now: new Date('2026-07-18T10:00:00.000Z') }, dispatcherDependencies);
  check('audit insert success plus processed-marker failure leaves one audit and pending outbox',
    firstDispatch.failed === 1
      && (await count(`SELECT COUNT(*) cnt FROM audit_logs WHERE id = ?`, [responseLossOutboxId])) === 1
      && (await count(`SELECT COUNT(*) cnt FROM pos_audit_outbox WHERE id = ? AND status = 'pending' AND attempts = 1`, [responseLossOutboxId])) === 1,
    JSON.stringify(firstDispatch));
  const secondDispatch = await dispatchAuditOutbox({ now: new Date('2026-07-18T11:00:00.000Z') }, dispatcherDependencies);
  check('duplicate retry converges to exactly one audit row and processed outbox',
    secondDispatch.processed === 1
      && (await count(`SELECT COUNT(*) cnt FROM audit_logs WHERE id = ?`, [responseLossOutboxId])) === 1
      && (await count(`SELECT COUNT(*) cnt FROM pos_audit_outbox WHERE id = ? AND status = 'processed'`, [responseLossOutboxId])) === 1,
    JSON.stringify(secondDispatch));

  const failed = results.filter((r) => !r.pass);
  console.log(`\n══ 结果: ${results.length - failed.length}/${results.length} 通过 ══`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`  ✗ ${f.name} — ${f.detail ?? ''}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('实测脚本异常:', e);
  process.exit(1);
});
