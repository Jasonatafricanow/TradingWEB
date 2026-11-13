import { applyRefundMoneyEffects } from '@/services/promotions/refund-effects';
import { posTransaction } from "./pos-idempotency-service";
import { PayPalProvider } from "@/services/payment/paypal-provider";
import { db } from '@/lib/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  orderItems,
  orders,
  orderTimeline,
  posRefundItems,
  refunds,
} from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';
import type { DbTx } from '@/services/orders/order-pricing-service';
import { formatCents, parseMoneyToCents } from '@/services/orders/order-money';
import { consumeApprovalToken } from './pos-approval-service';
import { hashPosRequest, type PosRefundRequest, type PosReturnItemInput } from './pos-contracts';
import { PosApiError } from './pos-errors';
import { runIdempotent, type IdempotencyCompletion, type IdempotencyInput } from './pos-idempotency-service';
import type { PosOperatorContext } from './pos-operator-session-service';
import { enqueuePosAuditEvent, type EnqueuePosAuditEvent } from './pos-audit-outbox-service';
import { findOpenShiftId } from './pos-shift-service';
import {
  allocateRefundTenders, cashCents, cashOutsideShift, insertRefundTenders, loadRefundTenderBasis,
  type RefundTender, type RefundTenderBasis,
} from './pos-refund-tenders';
import { restoreInventory } from '@/services/inventory/inventory-allocation-service';
import { RefundStatus, isRefundStatus } from '@/lib/enums';
import { TIMELINE_MESSAGES } from "@/lib/api-messages";
import { logAction } from './audit-service';
import { recordRefundRequestedEvent } from '@/services/notifications/order-notification-service';

function withOrder(row: Record<string, unknown>) {
  return {
    ...row,
    order: {
      order_no: row.order_no || null,
      total_amount: row.total_amount || null,
    },
    orders: {
      order_no: row.order_no || null,
      total_amount: row.total_amount || null,
    },
  };
}

/**
 * 列表查询参数：分页 + 状态 + 关键字搜索。
 * status: pending / approved / rejected / returned / completed
 * search: 命中 order_no 或 reason
 */
export interface ListRefundsOptions {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
}

// 用 src/lib/enums 的常量做白名单，避免拼错与硬编码字符串漂移。
const REFUND_STATUS_WHITELIST = new Set<string>([
  "processing",
  RefundStatus.Pending,
  RefundStatus.Approved,
  RefundStatus.Rejected,
  RefundStatus.Returned,
  RefundStatus.Completed,
]);

export async function listRefunds(options: ListRefundsOptions = {}) {
  try {
    const page = Math.max(1, Math.floor(options.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Math.floor(options.pageSize ?? 50)));
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const params: (string | number)[] = [];
    if (options.status && REFUND_STATUS_WHITELIST.has(options.status)) {
      where.push("r.status = ?");
      params.push(options.status);
    }
    if (options.search) {
      where.push("(o.order_no LIKE ? OR r.reason LIKE ?)");
      const q = `%${options.search}%`;
      params.push(q, q);
    }
    const whereSql = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";

    const [countRows] = await db.$client.execute(
      `SELECT COUNT(*) AS total FROM refunds r LEFT JOIN orders o ON r.order_id = o.id${whereSql}`,
      params,
    );
    const total = Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0);

    const [rows] = await db.$client.execute(
      `SELECT r.*, o.order_no, o.total_amount FROM refunds r ` +
      `LEFT JOIN orders o ON r.order_id = o.id${whereSql} ` +
      `ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    return {
      data: (rows as Record<string, unknown>[] || []).map(withOrder),
      total,
      page,
      pageSize,
      error: null,
    };
  } catch (error) {
    return { data: [], total: 0, page: 1, pageSize: 50, error };
  }
}

export async function createRefund(input: { order_id: string; amount: string; reason: string; user_id?: string; evidence?: string; admin_note?: string; processed_by?: string }) {
  return db.transaction(async tx => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.order_id)).for('update').limit(1);
    if (!order) throw new PosApiError('ORDER_NOT_FOUND', 'Order not found', 404);
    if (order.payment_status !== 'paid') throw new PosApiError('ORDER_NOT_PAID', 'Only paid orders can be refunded', 409);
    const amount = parseMoneyToCents(input.amount);
    if (amount <= 0) throw new PosApiError('INVALID_REFUND_AMOUNT', 'Refund must be positive', 400);
    const reserved = await tx.select({ amount: refunds.amount }).from(refunds).where(and(
      eq(refunds.order_id, input.order_id),
      inArray(refunds.status, [RefundStatus.Pending, RefundStatus.Approved, RefundStatus.Returned, RefundStatus.Completed, "processing"]),
    ));
    const totalReserved = reserved.reduce((sum, row) => sum + parseMoneyToCents(row.amount), 0);
    if (totalReserved + amount > parseMoneyToCents(order.total_amount)) throw new PosApiError('REFUND_EXCEEDS_TOTAL', 'Refund exceeds remaining order amount', 409);
    const id = randomUUID();
    await tx.insert(refunds).values({ id, order_id: input.order_id, user_id: input.user_id || null,
      amount: formatCents(amount), reason: input.reason, status: RefundStatus.Pending,
      evidence: input.evidence || null, admin_note: input.admin_note || null,
      processed_by: input.processed_by || null, restocked: false });
    await tx.update(orders).set({ has_refund: true }).where(eq(orders.id, input.order_id));
    if (input.processed_by) {
      await logAction({ userId: input.processed_by, action: 'refund.create', entityType: 'refund', entityId: id,
        details: { order_id: order.id, order_no: order.order_no, amount: formatCents(amount), reason: input.reason } }, tx);
    }
    await recordRefundRequestedEvent(order, { id, amount: formatCents(amount) }, tx);
    const [data] = await tx.select().from(refunds).where(eq(refunds.id, id)).limit(1);
    return data;
  });
}

function changedRows(result: unknown): number {
  return Number((result as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0);
}

/** Pending -> approved/rejected. Audits only when this call made the change. */
async function decideRefund(refundId: string, next: typeof RefundStatus.Approved | typeof RefundStatus.Rejected, adminId?: string, adminNote?: string) {
  return db.transaction(async tx => {
    const result = await tx.update(refunds).set({
      status: next,
      processed_by: adminId || null,
      processed_at: new Date(),
      ...(next === RefundStatus.Rejected ? { admin_note: adminNote || null } : {}),
    }).where(and(eq(refunds.id, refundId), eq(refunds.status, RefundStatus.Pending)));
    const [data] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
    if (changedRows(result) > 0 && data) {
      await logAction({ userId: adminId, action: next === RefundStatus.Approved ? 'refund.approve' : 'refund.reject',
        entityType: 'refund', entityId: refundId,
        details: { order_id: data.order_id, amount: data.amount, admin_note: adminNote || null } }, tx);
    }
    return data;
  });
}

export async function approveRefund(refundId: string, adminId?: string) {
  return decideRefund(refundId, RefundStatus.Approved, adminId);
}

export async function rejectRefund(refundId: string, adminNote?: string, adminId?: string) {
  return decideRefund(refundId, RefundStatus.Rejected, adminId, adminNote);
}

function paypalRefundProvider() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new PosApiError('PAYMENT_NOT_CONFIGURED', 'PayPal is not configured', 503);
  return new PayPalProvider(clientId, clientSecret, process.env.PAYPAL_SANDBOX !== 'false');
}

export async function completeRefund(refundId: string, transactionId?: string, actorId?: string | null) {
  if (!transactionId) throw new PosApiError('REFUND_VERIFICATION_REQUIRED', 'A provider refund ID is required', 400);
  const verified = await paypalRefundProvider().getRefundById(transactionId);
  if (verified.id !== transactionId || verified.localRefundId !== refundId || verified.status !== 'COMPLETED') {
    throw new PosApiError('REFUND_NOT_CONFIRMED', 'PayPal has not confirmed this refund', 409);
  }
  return db.transaction(async tx => {
    const [initial] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
    if (!initial) throw new PosApiError('REFUND_NOT_FOUND', 'Refund not found', 404);
    const [order] = await tx.select().from(orders).where(eq(orders.id, initial.order_id)).for('update').limit(1);
    const [refund] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).for('update').limit(1);
    if (!order || !refund || order.source === 'pos') throw new PosApiError('INVALID_REFUND_ORDER', 'Invalid online refund order', 409);
    if (verified.currency !== (order.currency || 'USD') || parseMoneyToCents(verified.amount) !== parseMoneyToCents(refund.amount)) {
      throw new PosApiError('REFUND_MISMATCH', 'Provider refund amount or currency mismatch', 409);
    }
    if (refund.status === RefundStatus.Completed) return refund;
    if (refund.status !== 'processing') throw new PosApiError('INVALID_REFUND_STATE', 'Refund was not submitted to provider', 409);
    const total = parseMoneyToCents(order.refunded_total || '0.00') + parseMoneyToCents(refund.amount);
    if (total > parseMoneyToCents(order.total_amount)) throw new PosApiError('REFUND_EXCEEDS_TOTAL', 'Refund exceeds order total', 409);
    const full = total === parseMoneyToCents(order.total_amount);
    await tx.update(refunds).set({ status: RefundStatus.Completed, processed_at: new Date(),
      admin_note: `${refund.admin_note || ''}\nPayPal refund: ${transactionId}`.trim() }).where(eq(refunds.id, refundId));
    await tx.update(orders).set({ refunded_total: formatCents(total), financial_status: full ? 'refunded' : 'partially_refunded',
      ...(full ? { payment_status: 'refunded' } : {}) }).where(eq(orders.id, order.id));
    const effects = await applyRefundMoneyEffects(order, { key: refundId, cents: parseMoneyToCents(refund.amount), full }, tx);
    await logAction({ userId: actorId ?? null, action: 'refund.complete', entityType: 'refund', entityId: refundId,
      details: { order_id: order.id, order_no: order.order_no, amount: refund.amount, currency: order.currency || 'USD',
        provider_refund_id: transactionId, source: actorId ? 'admin' : 'provider_webhook', full,
        commission_reversed: effects.commission?.reversed ?? null, wallet_restored: formatCents(effects.walletRestoredCents) } }, tx);
    const [data] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
    return data;
  });
}

export async function submitPayPalRefund(refundId: string, userId: string) {
  const provider = paypalRefundProvider();
  const prepared = await db.transaction(async tx => {
    const [initial] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
    if (!initial) throw new PosApiError('REFUND_NOT_FOUND', 'Refund not found', 404);
    const [order] = await tx.select().from(orders).where(eq(orders.id, initial.order_id)).for('update').limit(1);
    const [refund] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).for('update').limit(1);
    if (!order || !refund || order.source === 'pos' || order.payment_method !== 'paypal' || !order.payment_id) throw new PosApiError('PAYPAL_ORDER_REQUIRED', 'A captured PayPal order is required', 409);
    if (![RefundStatus.Approved, RefundStatus.Returned].includes(refund.status as typeof RefundStatus.Approved)) throw new PosApiError('INVALID_REFUND_STATE', 'Refund must be approved and not already submitted', 409);
    if (parseMoneyToCents(refund.amount) <= 0 || parseMoneyToCents(refund.amount) + parseMoneyToCents(order.refunded_total || '0.00') > parseMoneyToCents(order.total_amount)) throw new PosApiError('REFUND_EXCEEDS_TOTAL', 'Invalid remaining refund amount', 409);
    await tx.update(refunds).set({ status: 'processing', processed_by: userId, processed_at: new Date() }).where(eq(refunds.id, refundId));
    await logAction({ userId, action: 'refund.payout_submit', entityType: 'refund', entityId: refundId,
      details: { order_id: order.id, order_no: order.order_no, amount: refund.amount, currency: order.currency || 'USD' } }, tx);
    return { order, refund };
  });
  // Persist intent before sending money. Ambiguous failures remain processing;
  // verified webhook/reconciliation completes them without sending a second refund.
  const result = await provider.refund({ paymentId: prepared.order.payment_id!, amount: Number(prepared.refund.amount),
    currency: prepared.order.currency || 'USD', refundId, reason: prepared.refund.reason });
  if (!result.success || !result.refundId) throw new PosApiError('REFUND_PENDING_VERIFICATION', 'Refund requires provider reconciliation; do not resubmit', 409);
  return completeRefund(refundId, result.refundId, userId);
}

export async function getRefund(id: string) {
  try {
    const [rows] = await db.$client.execute(
      'SELECT r.*, o.order_no, o.total_amount FROM refunds r ' +
      'LEFT JOIN orders o ON r.order_id = o.id WHERE r.id = ? LIMIT 1',
      [id]
    );
    const row = (rows as Record<string, unknown>[])[0];
    if (!row) return null;

    // 前端读 selected.order.order_no（嵌套对象），所以把扁平 JOIN 字段封装为嵌套对象，
    // 同时保留 order_no / total_amount 在顶层保持向后兼容。
    const items = await db.select().from(orderItems).where(eq(orderItems.order_id, String(row.order_id)));
    return { ...withOrder(row), items };
  } catch (error) {
    throw error;
  }
}
export async function processRefund(id: string, action: string, adminNote?: string, userId?: string) {
  if (action === RefundStatus.Approved) return approveRefund(id, userId);
  if (action === RefundStatus.Rejected) return rejectRefund(id, adminNote, userId);
  throw new PosApiError("INVALID_REFUND_ACTION", "Invalid refund action", 400);
}
export async function confirmReturn(id: string, userId?: string) {
  // Receipt of goods does not prove provider repayment or inventory allocation.
  return db.transaction(async tx => {
    const result = await tx.update(refunds).set({ status: RefundStatus.Returned, processed_by: userId || null, processed_at: new Date() })
      .where(and(eq(refunds.id, id), eq(refunds.status, RefundStatus.Approved)));
    const [data] = await tx.select().from(refunds).where(eq(refunds.id, id)).limit(1);
    if (!data || data.status !== RefundStatus.Returned) throw new PosApiError('INVALID_REFUND_STATE', 'Refund must be approved before confirming return', 409);
    if (changedRows(result) > 0) {
      await logAction({ userId, action: 'refund.return_received', entityType: 'refund', entityId: id, details: { order_id: data.order_id } }, tx);
    }
    return data;
  });
}

export async function restockWebRefund(id: string, userId: string, returnItems: Array<{ order_item_id: string; quantity: number }>) {
  if (!Array.isArray(returnItems) || returnItems.length === 0 || returnItems.length > 100
    || returnItems.some(line => !line.order_item_id || !Number.isInteger(line.quantity) || line.quantity <= 0)
    || new Set(returnItems.map(line => line.order_item_id)).size !== returnItems.length) {
    throw new PosApiError("INVALID_RETURN_ITEMS", "Select valid unique return lines and quantities", 400);
  }
  return db.transaction(async tx => {
    const [initial] = await tx.select().from(refunds).where(eq(refunds.id, id)).limit(1);
    if (!initial) throw new PosApiError("REFUND_NOT_FOUND", "Refund not found", 404);
    const [order] = await tx.select().from(orders).where(eq(orders.id, initial.order_id)).for("update").limit(1);
    const [refund] = await tx.select().from(refunds).where(eq(refunds.id, id)).for("update").limit(1);
    if (!order || order.source === "pos") throw new PosApiError("WEB_ORDER_REQUIRED", "Use POS return workflow for POS sales", 409);
    if (!["approved", "returned", "processing", "completed"].includes(refund.status)) throw new PosApiError("INVALID_REFUND_STATE", "Return must be approved", 409);
    const previous = await tx.select().from(posRefundItems).where(eq(posRefundItems.refund_id, id));
    if (refund.restocked) {
      const canonical = (lines: Array<{ order_item_id: string; quantity: number }>) => JSON.stringify(lines.map(line => ({ order_item_id: line.order_item_id, quantity: line.quantity })).sort((a,b) => a.order_item_id.localeCompare(b.order_item_id)));
      if (canonical(previous) !== canonical(returnItems)) throw new PosApiError("RETURN_ALREADY_RECORDED", "Return already recorded with different lines", 409);
      return refund;
    }
    const items = await tx.select().from(orderItems).where(eq(orderItems.order_id, order.id)).for("update");
    const totals = await tx.select({ orderItemId: posRefundItems.order_item_id, quantity: sql<number>`SUM(${posRefundItems.quantity})` }).from(posRefundItems)
      .where(inArray(posRefundItems.order_item_id, returnItems.map(line => line.order_item_id))).groupBy(posRefundItems.order_item_id);
    for (const line of returnItems) {
      const item = items.find(item => item.id === line.order_item_id);
      const already = Number(totals.find(total => total.orderItemId === line.order_item_id)?.quantity || 0);
      if (!item || item.product_type !== "physical" || already + line.quantity > item.quantity) throw new PosApiError("RETURN_QUANTITY_EXCEEDED", "Return line is invalid or exceeds remaining quantity", 409);
      await restoreInventory({ originalOrderId: order.id, storeId: order.store_id, operatorId: userId, referenceType: "refund", referenceId: id, note: "Web return received",
        lines: [{ productId: item.product_id, variantId: item.variant_id, productType: item.product_type, title: item.product_title, quantity: line.quantity }] }, undefined, tx);
      await tx.insert(posRefundItems).values({ id: randomUUID(), refund_id: id, order_item_id: item.id, quantity: line.quantity, restock: true });
    }
    await tx.update(refunds).set({ restocked: true, ...(refund.status === "approved" ? { status: "returned" } : {}) }).where(eq(refunds.id, id));
    await tx.insert(orderTimeline).values({ id: randomUUID(), order_id: order.id, action: "return_restocked", description: TIMELINE_MESSAGES.webReturnRestocked(id), operator_id: userId });
    await logAction({ userId, action: "refund.restock", entityType: "refund", entityId: id, details: { order_id: order.id, lines: returnItems } }, tx);
    return { ...refund, restocked: true };
  });
}

export interface PosOriginalOrder {
  id: string;
  storeId: string | null;
  source: string;
  status: string;
  total: string;
  refundedTotal: string;
  currency: string;
  paymentMethod?: string | null;
}

export interface PosOriginalItem {
  orderId?: string;
  id: string;
  productId: string;
  variantId: string | null;
  productType: string;
  title: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

export interface PosRefundInput extends PosRefundRequest {
  order_id: string;
  account_user_id: string;
  operator: PosOperatorContext;
}

export interface PosRefundResult {
  refund_id: string;
  order_id: string;
  amount: string;
  refunded_total: string;
  items: PosReturnItemInput[];
  /** What to hand back, per tender (TW-10). */
  refund_tenders: RefundTender[];
}

export interface PreparedPosReturn {
  order: PosOriginalOrder;
  requested: Array<{ input: PosReturnItemInput; item: PosOriginalItem; previouslyReturned: number; amountCents: number }>;
  amount: string;
  refundedTotal: string;
}

export interface PosReturnDependencies {
  consumeApprovalToken(token: string, operation: string, resourceHash: string, storeId: string, tx: DbTx): Promise<string>;
  lockOriginalOrder(orderId: string, tx: DbTx): Promise<PosOriginalOrder | null>;
  lockOriginalItems(orderId: string, tx: DbTx): Promise<PosOriginalItem[]>;
  getReturnedQuantities(orderItemIds: string[], tx: DbTx): Promise<Map<string, number>>;
  restockReturn(item: PosOriginalItem, quantity: number, storeId: string, operatorId: string, refundId: string, tx: DbTx): Promise<void>;
  insertRefund(input: {
    id: string; orderId: string; accountUserId: string; amount: string; reason: string;
    restocked: boolean; operatorId: string; approvedBy: string; shiftId: string | null; createdAt: Date;
  }, tx: DbTx): Promise<string>;
  insertReturnItem(input: { id: string; refundId: string; orderItemId: string; quantity: number; restock: boolean; createdAt: Date }, tx: DbTx): Promise<void>;
  updateOriginalOrder(input: { orderId: string; refundedTotal: string; fullyRefunded: boolean }, tx: DbTx): Promise<void>;
  insertTimeline(input: Record<string, unknown>, tx: DbTx): Promise<void>;
  findOpenShiftId(storeId: string, tx: DbTx): Promise<string | null>;
  loadTenderBasis(order: PosOriginalOrder, tx: DbTx): Promise<RefundTenderBasis>;
  insertRefundTenders(input: { refundId: string; orderId: string; tenders: RefundTender[]; createdAt: Date }, tx: DbTx): Promise<void>;
  enqueueAuditEvent: EnqueuePosAuditEvent;
  newId(): string;
  now(): Date;
}

export interface PosRefundDependencies extends PosReturnDependencies {
  runIdempotent<T>(input: IdempotencyInput, work: () => Promise<T>, completion?: IdempotencyCompletion<T>): Promise<T>;
  transaction<T>(work: (tx: DbTx) => Promise<T>): Promise<T>;
}

function approvalHash(input: Record<string, unknown>): string {
  const { approval_token: _approvalToken, account_user_id: _accountUserId, operator: _operator, ...approvedResource } = input;
  void _approvalToken;
  void _accountUserId;
  void _operator;
  return hashPosRequest(approvedResource);
}

export function assertPosReturnOperator(
  input: { account_user_id: string; store_id: string; operator: PosOperatorContext },
  permission: 'refund' | 'exchange',
): void {
  if (input.account_user_id !== input.operator.accountUserId || input.store_id !== input.operator.storeId) {
    throw new PosApiError('OPERATOR_MISMATCH', 'Operator session does not match return request', 403);
  }
  if (!input.operator.permissions.includes(permission)) {
    throw new PosApiError(`${permission.toUpperCase()}_PERMISSION_REQUIRED`, `Operator does not have ${permission} permission`, 403);
  }
}

function allocateOrderCents(orderTotalCents: number, items: PosOriginalItem[]): Map<string, number> {
  const subtotalCents = items.map((item) => ({ item, cents: parseMoneyToCents(item.subtotal) }));
  const subtotalTotal = subtotalCents.reduce((sum, line) => sum + line.cents, 0);
  if (subtotalTotal <= 0 || orderTotalCents <= 0) return new Map(items.map((item) => [item.id, 0]));

  const shares = subtotalCents.map(({ item, cents }) => {
    const numerator = orderTotalCents * cents;
    return { id: item.id, cents: Math.floor(numerator / subtotalTotal), remainder: numerator % subtotalTotal };
  });
  let missing = orderTotalCents - shares.reduce((sum, share) => sum + share.cents, 0);
  shares.sort((left, right) => right.remainder - left.remainder || left.id.localeCompare(right.id));
  for (let index = 0; index < shares.length && missing > 0; index += 1, missing -= 1) shares[index].cents += 1;
  return new Map(shares.map((share) => [share.id, share.cents]));
}

function cumulativeUnitCents(lineCents: number, quantity: number, returned: number): number {
  const base = Math.floor(lineCents / quantity);
  const extra = lineCents % quantity;
  return returned * base + Math.min(returned, extra);
}

export async function preparePosReturn(
  input: { orderId: string; storeId: string; returnItems: PosReturnItemInput[] },
  dependencies: PosReturnDependencies,
  tx: DbTx,
): Promise<PreparedPosReturn> {
  const order = await dependencies.lockOriginalOrder(input.orderId, tx);
  if (!order) throw new PosApiError('ORDER_NOT_FOUND', 'Original order not found', 404);
  if (order.source !== 'pos') throw new PosApiError('POS_ORDER_REQUIRED', 'Only POS orders can use this return workflow', 409);
  if (order.storeId !== input.storeId) throw new PosApiError('ORDER_STORE_MISMATCH', 'Original order belongs to another store', 409);

  const allItems = await dependencies.lockOriginalItems(order.id, tx);
  const byId = new Map(allItems.map((item) => [item.id, item]));
  const requestedIds = input.returnItems.map((item) => item.order_item_id);
  const returned = await dependencies.getReturnedQuantities(requestedIds, tx);
  const allocated = allocateOrderCents(parseMoneyToCents(order.total), allItems);

  const requested = input.returnItems.map((returnItem) => {
    const item = byId.get(returnItem.order_item_id);
    if (!item) throw new PosApiError('ORDER_ITEM_NOT_FOUND', 'Return item does not belong to the original order', 404);
    const previouslyReturned = returned.get(item.id) ?? 0;
    const nextReturned = previouslyReturned + returnItem.quantity;
    if (nextReturned > item.quantity) {
      throw new PosApiError('RETURN_QUANTITY_EXCEEDED', 'Return quantity exceeds the remaining returnable quantity', 409, false, {
        order_item_id: item.id,
        remaining_quantity: Math.max(0, item.quantity - previouslyReturned),
      });
    }
    const lineCents = allocated.get(item.id) ?? 0;
    const amountCents = cumulativeUnitCents(lineCents, item.quantity, nextReturned)
      - cumulativeUnitCents(lineCents, item.quantity, previouslyReturned);
    return { input: returnItem, item, previouslyReturned, amountCents };
  });
  const amountCents = requested.reduce((sum, line) => sum + line.amountCents, 0);
  const refundedTotalCents = parseMoneyToCents(order.refundedTotal) + amountCents;
  if (refundedTotalCents > parseMoneyToCents(order.total)) {
    throw new PosApiError('REFUND_TOTAL_EXCEEDED', 'Refund total exceeds original order total', 409);
  }
  return {
    order,
    requested,
    amount: formatCents(amountCents),
    refundedTotal: formatCents(refundedTotalCents),
  };
}

const databasePosReturnDependencies: PosRefundDependencies = {
  runIdempotent,
  transaction: (work) => posTransaction(work),
  findOpenShiftId,
  loadTenderBasis: (order, tx) => loadRefundTenderBasis(order.id, order.paymentMethod ?? null, tx),
  insertRefundTenders,
  enqueueAuditEvent: enqueuePosAuditEvent,
  consumeApprovalToken,
  async lockOriginalOrder(orderId, tx) {
    const [order] = await tx.select({
      id: orders.id,
      storeId: orders.store_id,
      source: orders.source,
      status: orders.status,
      total: orders.total_amount,
      refundedTotal: orders.refunded_total,
      currency: orders.currency,
      paymentMethod: orders.payment_method,
    }).from(orders).where(eq(orders.id, orderId)).for('update').limit(1);
    return order ?? null;
  },
  async lockOriginalItems(orderId, tx) {
    const rows = await tx.select({
      id: orderItems.id,
      orderId: orderItems.order_id,
      productId: orderItems.product_id,
      variantId: orderItems.variant_id,
      productType: orderItems.product_type,
      title: orderItems.product_title,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unit_price,
      subtotal: orderItems.subtotal,
    }).from(orderItems).where(eq(orderItems.order_id, orderId)).for('update');
    return rows;
  },
  async getReturnedQuantities(orderItemIds, tx) {
    if (orderItemIds.length === 0) return new Map();
    const rows = await tx.select({
      orderItemId: posRefundItems.order_item_id,
      quantity: sql<number>`COALESCE(SUM(${posRefundItems.quantity}), 0)`,
    }).from(posRefundItems).where(inArray(posRefundItems.order_item_id, orderItemIds))
      .groupBy(posRefundItems.order_item_id);
    return new Map(rows.map((row) => [row.orderItemId, Number(row.quantity)]));
  },
  async restockReturn(item, quantity, storeId, operatorId, refundId, tx) {
    await restoreInventory({
      originalOrderId: item.orderId,
      storeId,
      operatorId,
      referenceType: 'refund',
      referenceId: refundId,
      note: 'POS return',
      lines: [{
        productId: item.productId,
        variantId: item.variantId,
        productType: item.productType,
        title: item.title,
        quantity,
      }],
    }, undefined, tx);
  },
  async insertRefund(input, tx) {
    await tx.insert(refunds).values({
      id: input.id,
      order_id: input.orderId,
      shift_id: input.shiftId,
      user_id: input.accountUserId,
      reason: input.reason,
      amount: input.amount,
      status: RefundStatus.Completed,
      admin_note: `POS approval by ${input.approvedBy}`,
      restocked: input.restocked,
      processed_by: input.operatorId,
      created_at: input.createdAt,
      processed_at: input.createdAt,
    });
    return input.id;
  },
  async insertReturnItem(input, tx) {
    await tx.insert(posRefundItems).values({
      id: input.id,
      refund_id: input.refundId,
      order_item_id: input.orderItemId,
      quantity: input.quantity,
      restock: input.restock,
      created_at: input.createdAt,
    });
  },
  async updateOriginalOrder(input, tx) {
    await tx.update(orders).set({
      has_refund: true,
      refunded_total: input.refundedTotal,
      financial_status: input.fullyRefunded ? 'refunded' : 'partially_refunded',
      updated_at: new Date(),
    }).where(eq(orders.id, input.orderId));
  },
  async insertTimeline(input, tx) {
    await tx.insert(orderTimeline).values(input as typeof orderTimeline.$inferInsert);
  },
  newId: randomUUID,
  now: () => new Date(),
};

export async function refundPosOrder(
  input: PosRefundInput,
  dependencies: PosRefundDependencies = databasePosReturnDependencies,
): Promise<PosRefundResult> {
  assertPosReturnOperator(input, 'refund');
  if (!input.approval_token) throw new PosApiError('APPROVAL_REQUIRED', 'A one-time approval token is required', 403);
  const resourceHash = approvalHash(input as unknown as Record<string, unknown>);

  return dependencies.runIdempotent({
    key: input.idempotency_key,
    operation: 'refund',
    storeId: input.store_id,
    requestHash: resourceHash,
  }, () => dependencies.transaction(async (tx) => {
    const approvedBy = await dependencies.consumeApprovalToken(input.approval_token!, 'refund', resourceHash, input.store_id, tx);
    if (approvedBy === input.operator.staffId) throw new PosApiError('INDEPENDENT_APPROVER_REQUIRED', 'Approval must be issued by another authorized staff member', 403);
    const prepared = await preparePosReturn({
      orderId: input.order_id,
      storeId: input.store_id,
      returnItems: input.return_items,
    }, dependencies, tx);
    const refundId = dependencies.newId();
    const shiftId = await dependencies.findOpenShiftId(input.store_id, tx);
    const tenders = allocateRefundTenders(parseMoneyToCents(prepared.amount), await dependencies.loadTenderBasis(prepared.order, tx));
    for (const line of prepared.requested) {
      if (line.input.restock) {
        await dependencies.restockReturn(line.item, line.input.quantity, input.store_id, input.operator.staffId, refundId, tx);
      }
    }
    const now = dependencies.now();
    await dependencies.insertRefund({
      id: refundId,
      orderId: prepared.order.id,
      accountUserId: input.account_user_id,
      amount: prepared.amount,
      reason: input.reason,
      restocked: input.return_items.every((item) => item.restock),
      operatorId: input.operator.staffId,
      approvedBy,
      shiftId,
      createdAt: now,
    }, tx);
    for (const line of prepared.requested) {
      await dependencies.insertReturnItem({
        id: dependencies.newId(),
        refundId,
        orderItemId: line.item.id,
        quantity: line.input.quantity,
        restock: line.input.restock,
        createdAt: now,
      }, tx);
    }
    await dependencies.insertRefundTenders({ refundId, orderId: prepared.order.id, tenders, createdAt: now }, tx);
    await dependencies.updateOriginalOrder({
      orderId: prepared.order.id,
      refundedTotal: prepared.refundedTotal,
      fullyRefunded: prepared.refundedTotal === prepared.order.total,
    }, tx);
    await dependencies.insertTimeline({
      id: dependencies.newId(),
      order_id: prepared.order.id,
      action: 'pos_refund',
      description: input.reason,
      new_value: prepared.amount,
      operator_id: input.operator.staffId,
      created_at: now,
    }, tx);
    await dependencies.enqueueAuditEvent(tx, {
      eventType: 'pos.refund.completed',
      entityType: 'refund',
      entityId: refundId,
      storeId: input.store_id,
      operatorId: input.operator.staffId,
      payload: { order_id: prepared.order.id, amount: prepared.amount, shift_id: shiftId, tenders,
        cash_outside_shift: cashOutsideShift(shiftId, cashCents(tenders)) },
    });
    return {
      refund_id: refundId,
      order_id: prepared.order.id,
      amount: prepared.amount,
      refunded_total: prepared.refundedTotal,
      items: input.return_items,
      refund_tenders: tenders,
    };
  }), {
    responseStatus: 201,
    resourceType: 'refund',
    resourceId: (result) => result.refund_id,
  });
}

export { approvalHash, databasePosReturnDependencies };
