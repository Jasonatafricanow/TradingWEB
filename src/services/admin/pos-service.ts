import { db } from '@/lib/db';
import { asc, eq } from 'drizzle-orm';
import { orders, orderItems, orderTimeline, paymentMethods, stores } from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';
import { recordOrderPayment } from '@/services/orders/order-payment-service';
import { priceOrder, type DbTx, type PriceOrderInput, type PricedOrder } from '@/services/orders/order-pricing-service';
import { validateFulfillment } from '@/services/orders/fulfillment-validation-service';
import { allocateInventory } from '@/services/inventory/inventory-allocation-service';
import { formatCents, parseMoneyToCents } from '@/services/orders/order-money';
import { hashPosRequest, type PosCheckoutRequestV1, type PosOrderDto } from './pos-contracts';
import { PosApiError } from './pos-errors';
import { parsePosTaxRateBps } from './pos-store-config';
import { runIdempotent, type IdempotencyCompletion, type IdempotencyInput } from './pos-idempotency-service';
import type { PosOperatorContext } from './pos-operator-session-service';
import { enqueuePosAuditEvent, type EnqueuePosAuditEvent } from './pos-audit-outbox-service';
import { findOpenShiftId } from './pos-shift-service';

// P3 POS:门店收银。
// 与线上支付回调不同,POS 结账必须强一致:库存不足直接失败、不创建已付款订单、
// 不吞异常 —— 校验、扣门店库存、orders/order_items/inventory_transactions/
// order_timeline 全部在同一个数据库事务里,任何一步失败整体回滚。
// (刻意不走 runOrderPaidSideEffects:那条路径为外部支付回调设计,扣库存失败只打日志。)
//
// 库存口径(catalog 与 checkout 严格一致):
// - 无变体商品:只使用 variant_id IS NULL 的 inventory 行;本门店行优先,
//   其次未归属门店(store_id IS NULL)的仓库行,多行摊扣;其他门店的行不可用。
// - 变体商品同样只使用 inventory 行账。0031 会安全迁移可唯一定位的旧汇总库存；
//   无法唯一定位的旧数据写入迁移异常清单，目录与结账均不会猜测其门店归属。

export class PosCheckoutError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// ── P3-02 商品搜索 ──────────────────────────────────────────────

export interface PosCatalogItem {
  product_id: string;
  variant_id: string | null;
  title: string;
  variant_title: string | null;
  sku: string | null;
  barcode: string | null;
  price: number;
  type: string;
  stock: number;
  image: string | null;
}

export async function searchPosCatalog(query: string, storeId?: string, limit = 20): Promise<PosCatalogItem[]> {
  const q = `%${query.trim()}%`;
  const exact = query.trim();
  // 未选门店时只看未归属门店的仓库行
  const storeCond = storeId ? '(i.store_id = ? OR i.store_id IS NULL)' : 'i.store_id IS NULL';

  // 无变体商品:只统计 variant_id IS NULL 的库存行(与 checkout 同口径)
  const [productRows] = await db.$client.execute(
    `SELECT p.id as product_id, NULL as variant_id, p.title, NULL as variant_title, p.barcode as sku, p.barcode as barcode,
       p.price, p.type, p.image_key as image,
       (SELECT COALESCE(SUM(i.stock),0) FROM inventory i
         WHERE i.product_id = p.id AND i.variant_id IS NULL AND ${storeCond}) as stock
     FROM products p
     WHERE p.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)
       AND (p.barcode = ? OR p.barcode LIKE ? OR p.title LIKE ? OR p.title_en LIKE ?)
     LIMIT ?`,
    // LIMIT 参数必须以字符串绑定:mysql2 把 JS number 编码为 DOUBLE,部分 MySQL 版本拒收
    storeId ? [storeId, exact, q, q, q, String(limit)] : [exact, q, q, q, String(limit)]
  );

  // 变体:按商品名、产品条码或 SKU 搜,精确命中排最前(扫码/输码场景)。
  // 库存只取本门店与未归属的 inventory 行，不含其他门店，也不回退旧汇总字段。
  const [variantRows] = await db.$client.execute(
    `SELECT p.id as product_id, v.id as variant_id, p.title, v.title as variant_title, COALESCE(v.sku, v.barcode, p.barcode) as sku, COALESCE(v.barcode, p.barcode) as barcode,
       v.price, p.type, COALESCE(v.image, p.image_key) as image,
       (SELECT COALESCE(SUM(i.stock),0) FROM inventory i
         WHERE i.product_id = p.id AND i.variant_id = v.id AND ${storeCond}) as stock
     FROM product_variants v
     JOIN products p ON v.product_id = p.id
     WHERE p.status = 'active'
       AND (v.sku = ? OR v.barcode = ? OR p.barcode = ? OR v.sku LIKE ? OR v.barcode LIKE ? OR p.barcode LIKE ? OR p.title LIKE ? OR p.title_en LIKE ?)
     ORDER BY (v.sku = ? OR v.barcode = ? OR p.barcode = ?) DESC, p.title ASC
     LIMIT ?`,
    storeId
      ? [storeId, exact, exact, exact, q, q, q, q, q, exact, exact, exact, String(limit)]
      : [exact, exact, exact, q, q, q, q, q, exact, exact, exact, String(limit)]
  );

  const normalize = (r: Record<string, unknown>): PosCatalogItem => ({
    product_id: String(r.product_id),
    variant_id: r.variant_id ? String(r.variant_id) : null,
    title: String(r.title ?? ''),
    variant_title: r.variant_title ? String(r.variant_title) : null,
    sku: r.sku ? String(r.sku) : null,
    barcode: r.barcode ? String(r.barcode) : null,
    price: Number(r.price || 0),
    type: String(r.type ?? ''),
    stock: Number(r.stock || 0),
    image: r.image ? String(r.image) : null,
  });

  const variants = (variantRows as Record<string, unknown>[]).map(normalize);
  const plain = (productRows as Record<string, unknown>[]).map(normalize);
  return [...variants, ...plain].slice(0, limit);
}

// ── P3-03 强一致结账 ────────────────────────────────────────────

// ── P3-04 门店日结 ──────────────────────────────────────────────

export interface PosDailyReport {
  store: { id: string; name: string } | null;
  date: string;
  order_count: number;
  total_amount: number;
  by_payment_method: { method: string; count: number; amount: number }[];
  orders: {
    order_no: string;
    created_at: string;
    total_amount: number;
    discount_amount: number;
    payment_method: string | null;
    buyer_phone: string | null;
  }[];
}

/** JS Date → drizzle 写库用的 UTC 'YYYY-MM-DD HH:mm:ss' 表示 */
function toUtcSqlString(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * 按门店按日汇总 POS 销售(已取消订单不计入),供店长班末对账。
 * drizzle 的 timestamp 按 UTC 写库,而"哪一天"按服务器本地时区(即门店营业时区)理解:
 * 把本地日 [00:00, 24:00) 换算成 UTC 窗口查询,避免日界差几小时。
 */
export async function getPosDailyReport(storeId: string, date: string): Promise<PosDailyReport> {
  const [storeRows] = await db.$client.execute('SELECT id, name FROM stores WHERE id = ? LIMIT 1', [storeId]);
  const store = (storeRows as { id: string; name: string }[])[0] ?? null;

  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const startUtc = toUtcSqlString(dayStart);
  const endUtc = toUtcSqlString(dayEnd);

  const where = `WHERE o.source = 'pos' AND o.store_id = ? AND o.created_at >= ? AND o.created_at < ? AND o.status != 'cancelled'`;
  const whereParams = [storeId, startUtc, endUtc];

  const [summaryRows] = await db.$client.execute(
    `SELECT COUNT(*) as order_count, COALESCE(SUM(o.total_amount), 0) as total_amount FROM orders o ${where}`,
    whereParams
  );
  const summary = (summaryRows as Record<string, unknown>[])[0] || {};

  const [methodRows] = await db.$client.execute(
    `SELECT o.payment_method as method, COUNT(*) as count, COALESCE(SUM(o.total_amount), 0) as amount
     FROM orders o ${where} GROUP BY o.payment_method ORDER BY amount DESC`,
    whereParams
  );

  const [orderRows] = await db.$client.execute(
    `SELECT o.order_no, o.created_at, o.total_amount, o.discount_amount, o.payment_method, o.buyer_phone
     FROM orders o ${where} ORDER BY o.created_at ASC LIMIT ?`,
    [...whereParams, String(500)]
  );

  return {
    store,
    date,
    order_count: Number(summary.order_count || 0),
    total_amount: Number(summary.total_amount || 0),
    by_payment_method: (methodRows as Record<string, unknown>[]).map((r) => ({
      method: String(r.method ?? 'unknown'),
      count: Number(r.count || 0),
      amount: Number(r.amount || 0),
    })),
    orders: (orderRows as Record<string, unknown>[]).map((r) => ({
      order_no: String(r.order_no ?? ''),
      created_at: String(r.created_at ?? ''),
      total_amount: Number(r.total_amount || 0),
      discount_amount: Number(r.discount_amount || 0),
      payment_method: r.payment_method ? String(r.payment_method) : null,
      buyer_phone: r.buyer_phone ? String(r.buyer_phone) : null,
    })),
  };
}

export interface PosCheckoutInputV1 extends PosCheckoutRequestV1 {
  account_user_id: string;
  operator: PosOperatorContext;
}

export interface PosCheckoutStore {
  id: string;
  name: string;
  status: string;
  currency: string;
  taxRateBps: number;
  pricingVersion: string;
  paymentMethods: string[];
}

interface PosOrderInsert extends Record<string, unknown> {
  id: string;
  order_no: string;
  total_amount: string;
  staff_id: string;
  account_user_id: string;
}

interface PosOrderItemInsert extends Record<string, unknown> {
  id: string;
  order_id: string;
}

export interface PosCheckoutDependencies {
  getStore(storeId: string): Promise<PosCheckoutStore | null>;
  validateFulfillment: typeof validateFulfillment;
  priceOrder(input: PriceOrderInput, tx: DbTx): Promise<PricedOrder>;
  runIdempotent<T>(input: IdempotencyInput, work: () => Promise<T>, completion?: IdempotencyCompletion<T>): Promise<T>;
  transaction<T>(work: (tx: DbTx) => Promise<T>): Promise<T>;
  findOpenShiftId(storeId: string, tx: DbTx): Promise<string | null>;
  insertOrder(input: PosOrderInsert, tx: DbTx): Promise<void>;
  insertOrderItem(input: PosOrderItemInsert, tx: DbTx): Promise<void>;
  allocateInventory(input: Parameters<typeof allocateInventory>[0], tx: DbTx): ReturnType<typeof allocateInventory>;
  recordOrderPayment(input: Parameters<typeof recordOrderPayment>[0], tx: DbTx): ReturnType<typeof recordOrderPayment>;
  insertTimeline(input: Record<string, unknown>, tx: DbTx): Promise<void>;
  enqueueAuditEvent: EnqueuePosAuditEvent;
  newId(): string;
  newOrderNo(): string;
  now(): Date;
}

function generatePosOrderNo(): string {
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return 'POS' + dateStr + random;
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

const databaseCheckoutDependencies: PosCheckoutDependencies = {
  async getStore(storeId) {
    const [store] = await db.select({
      id: stores.id,
      name: stores.name,
      status: stores.status,
      metadata: stores.metadata,
    }).from(stores).where(eq(stores.id, storeId)).limit(1);
    if (!store) return null;
    const methods = await db.select({ code: paymentMethods.code })
      .from(paymentMethods)
      .where(eq(paymentMethods.enabled, true))
      .orderBy(asc(paymentMethods.sort_order));
    const metadata = metadataObject(store.metadata);
    return {
      id: store.id,
      name: store.name,
      status: store.status,
      currency: typeof metadata.currency === 'string' ? metadata.currency : 'USD',
      taxRateBps: parsePosTaxRateBps(metadata.tax_rate),
      pricingVersion: typeof metadata.pricing_version === 'string' ? metadata.pricing_version : 'pos-v1',
      paymentMethods: methods.map((method) => method.code),
    };
  },
  validateFulfillment,
  priceOrder: (input, tx) => priceOrder(input, undefined, tx),
  runIdempotent,
  transaction: (work) => db.transaction(work),
  findOpenShiftId,
  async insertOrder(input, tx) {
    await tx.insert(orders).values(input as typeof orders.$inferInsert);
  },
  async insertOrderItem(input, tx) {
    await tx.insert(orderItems).values(input as typeof orderItems.$inferInsert);
  },
  allocateInventory: (input, tx) => allocateInventory(input, undefined, tx),
  recordOrderPayment,
  async insertTimeline(input, tx) {
    await tx.insert(orderTimeline).values(input as typeof orderTimeline.$inferInsert);
  },
  enqueueAuditEvent: enqueuePosAuditEvent,
  newId: randomUUID,
  newOrderNo: generatePosOrderNo,
  now: () => new Date(),
};

function combinedDiscount(priced: PricedOrder): string {
  return formatCents(parseMoneyToCents(priced.lineDiscountTotal) + parseMoneyToCents(priced.orderDiscount));
}

function authoritativePreview(priced: PricedOrder) {
  return {
    subtotal: priced.subtotal,
    discount: combinedDiscount(priced),
    tax: priced.tax,
    total: priced.total,
  };
}

function assertOperator(input: PosCheckoutInputV1): void {
  if (
    input.account_user_id !== input.operator.accountUserId
    || input.staff_id !== input.operator.staffId
    || input.store_id !== input.operator.storeId
  ) {
    throw new PosApiError('OPERATOR_MISMATCH', 'Operator session does not match checkout request', 403);
  }
  if (!input.operator.permissions.includes('checkout')) {
    throw new PosApiError('CHECKOUT_PERMISSION_REQUIRED', 'Operator does not have checkout permission', 403);
  }
}

export async function posCheckout(
  input: PosCheckoutInputV1,
  dependencies: PosCheckoutDependencies = databaseCheckoutDependencies,
): Promise<PosOrderDto> {
  assertOperator(input);
  const store = await dependencies.getStore(input.store_id);
  if (!store) throw new PosApiError('STORE_NOT_FOUND', 'Store not found', 404);
  if (store.status !== 'active') throw new PosApiError('STORE_INACTIVE', 'Store is not active', 409);
  if (input.currency !== store.currency) {
    throw new PosApiError('CURRENCY_MISMATCH', 'Checkout currency does not match store currency', 409, false, { currency: store.currency });
  }
  if (input.pricing_version !== store.pricingVersion) {
    throw new PosApiError('PRICING_VERSION_CHANGED', 'Pricing version changed', 409, false, { pricing_version: store.pricingVersion });
  }
  for (const payment of input.payments) {
    if (!store.paymentMethods.includes(payment.method) && !payment.method.startsWith('custom_')) {
      throw new PosApiError('PAYMENT_METHOD_NOT_ALLOWED', `Payment method is not allowed: ${payment.method}`, 400);
    }
  }
  const fulfillment = dependencies.validateFulfillment(input.fulfillment);
  const { account_user_id: _accountUserId, operator: _operator, ...request } = input;
  void _accountUserId;
  void _operator;

  return dependencies.runIdempotent({
    key: input.idempotency_key,
    operation: 'checkout',
    storeId: input.store_id,
    requestHash: hashPosRequest(request),
  }, () => dependencies.transaction(async (tx) => {
    const priced = await dependencies.priceOrder({
      items: input.items,
      order_discount: input.order_discount,
      tax_rate_bps: store.taxRateBps,
    }, tx);
    const preview = authoritativePreview(priced);
    if (JSON.stringify(preview) !== JSON.stringify(input.pricing_preview)) {
      throw new PosApiError('PRICING_CHANGED', 'Authoritative pricing changed', 409, false, preview);
    }
    const paymentTotal = input.payments.reduce((sum, payment) => sum + parseMoneyToCents(payment.amount), 0);
    if (paymentTotal !== parseMoneyToCents(priced.total)) {
      throw new PosApiError('PAYMENT_TOTAL_MISMATCH', 'Payments must equal the authoritative total', 409, false, { total: priced.total });
    }

    const orderId = dependencies.newId();
    const orderNo = dependencies.newOrderNo();
    const now = dependencies.now();
    const fulfillmentStatus = fulfillment.method === 'in_store' ? 'fulfilled' : 'unfulfilled';
    const pickupAt = fulfillment.method === 'pickup' ? fulfillment.pickup_at ?? null : null;
    const shiftId = await dependencies.findOpenShiftId(store.id, tx);
    await dependencies.insertOrder({
      id: orderId,
      order_no: orderNo,
      user_id: input.customer_id ?? 'pos-guest',
      store_id: store.id,
      shift_id: shiftId,
      source: 'pos',
      client_ref: input.idempotency_key,
      status: 'completed',
      financial_status: 'paid',
      payment_status: 'paid',
      fulfillment_status: fulfillmentStatus,
      total_amount: priced.total,
      currency: store.currency,
      payment_method: input.payments.length === 1 ? input.payments[0].method : 'split',
      payment_id: `pos:${input.staff_id}`,
      buyer_name: 'contact_name' in fulfillment ? fulfillment.contact_name ?? null : null,
      buyer_phone: 'phone' in fulfillment ? fulfillment.phone ?? null : null,
      pickup_contact_name: fulfillment.method === 'pickup' ? fulfillment.contact_name : null,
      pickup_phone: fulfillment.method === 'pickup' ? fulfillment.phone : null,
      pickup_store_id: fulfillment.method === 'pickup' ? store.id : null,
      delivery_date: pickupAt?.slice(0, 10) ?? null,
      delivery_time_slot: pickupAt?.slice(11, 16) ?? null,
      shipping_address: fulfillment.method === 'ship' ? { address: fulfillment.address } : null,
      notes: input.note,
      discount_amount: preview.discount,
      created_at: now,
      staff_id: input.staff_id,
      account_user_id: input.account_user_id,
    }, tx);

    const dtoItems: PosOrderDto['items'] = [];
    for (const line of priced.lines) {
      const itemId = dependencies.newId();
      await dependencies.insertOrderItem({
        id: itemId,
        order_id: orderId,
        product_id: line.productId,
        variant_id: line.variantId,
        product_title: line.title,
        product_type: line.productType,
        sku: line.sku,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        subtotal: line.lineTotal,
        delivery_method: fulfillment.method,
      }, tx);
      dtoItems.push({
        id: itemId,
        product_id: line.productId,
        variant_id: line.variantId,
        name: line.title,
        sku: line.sku,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        line_discount: line.lineDiscount,
        delivery_method: fulfillment.method,
      });
    }

    for (const payment of input.payments) {
      await dependencies.recordOrderPayment({
        orderId,
        channel: 'pos',
        method: payment.method,
        label: payment.label,
        amount: payment.amount,
        reference: payment.reference,
        providerTransactionId: null,
        status: 'recorded',
        recordedBy: input.staff_id,
      }, tx);
    }
    await dependencies.allocateInventory({
      storeId: store.id,
      lines: priced.lines,
      operatorId: input.staff_id,
      referenceType: 'order',
      referenceId: orderId,
      note: `POS sale (${store.name})`,
    }, tx);
    await dependencies.insertTimeline({
      id: dependencies.newId(),
      order_id: orderId,
      action: 'pos_sale',
      description: `POS sale @ ${store.name}`,
      new_value: priced.total,
      operator_id: input.staff_id,
      created_at: now,
    }, tx);
    await dependencies.enqueueAuditEvent(tx, {
      eventType: 'pos.checkout.completed',
      entityType: 'order',
      entityId: orderId,
      storeId: store.id,
      operatorId: input.staff_id,
      payload: { order_no: orderNo, total: priced.total, shift_id: shiftId },
    });

    return {
      id: orderId,
      order_no: orderNo,
      created_at: now.toISOString(),
      source: 'pos',
      status: 'completed',
      financial_status: 'paid',
      fulfillment_status: fulfillmentStatus,
      subtotal: priced.subtotal,
      discount_total: preview.discount,
      tax_total: priced.tax,
      total: priced.total,
      refunded_total: '0.00',
      pickup_contact_name: fulfillment.method === 'pickup' ? fulfillment.contact_name : null,
      pickup_phone: fulfillment.method === 'pickup' ? fulfillment.phone : null,
      pickup_store_id: fulfillment.method === 'pickup' ? store.id : null,
      pickup_ready_at: null,
      picked_up_at: null,
      items: dtoItems,
      payments: input.payments,
    } satisfies PosOrderDto;
  }), {
    responseStatus: 201,
    resourceType: 'order',
    resourceId: (result) => result.id,
  });
}
