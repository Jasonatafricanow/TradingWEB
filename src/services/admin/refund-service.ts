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
import { restoreInventory } from '@/services/inventory/inventory-allocation-service';
import { RefundStatus, isRefundStatus } from '@/lib/enums';

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
  try {
    const [order] = await db.select().from(orders).where(eq(orders.id, input.order_id)).limit(1);
    if (!order) throw new Error('Order not found');

    const id = randomUUID();
    await db.insert(refunds).values({
      id,
      order_id: input.order_id,
      user_id: input.user_id || null,
      amount: input.amount,
      reason: input.reason,
      status: RefundStatus.Pending,
      evidence: input.evidence || null,
      admin_note: input.admin_note || null,
      processed_by: input.processed_by || null,
      restocked: false,
    });

    await db.update(orders).set({ has_refund: true }).where(eq(orders.id, input.order_id));

    const [data] = await db.select().from(refunds).where(eq(refunds.id, id)).limit(1);
    return data;
  } catch (error) {
    throw error;
  }
}

export async function approveRefund(refundId: string, adminId?: string) {
  try {
    await db.update(refunds).set({ status: RefundStatus.Approved, processed_by: adminId || null, processed_at: new Date() }).where(eq(refunds.id, refundId));
    const [data] = await db.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
    return data;
  } catch (error) {
    throw error;
  }
}

export async function rejectRefund(refundId: string, adminNote?: string, adminId?: string) {
  try {
    await db.update(refunds).set({ status: RefundStatus.Rejected, admin_note: adminNote || null, processed_by: adminId || null, processed_at: new Date() }).where(eq(refunds.id, refundId));
    const [data] = await db.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
    return data;
  } catch (error) {
    throw error;
  }
}

export async function completeRefund(refundId: string, transactionId?: string) {
  try {
    const updateData: Record<string, unknown> = { status: RefundStatus.Completed, restocked: true, processed_at: new Date() };
    if (transactionId) updateData.admin_note = 'Transaction: ' + transactionId;
    await db.update(refunds).set(updateData).where(eq(refunds.id, refundId));
    const [data] = await db.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
    return data;
  } catch (error) {
    throw error;
  }
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
    return withOrder(row);
  } catch (error) {
    throw error;
  }
}
export async function processRefund(id: string, action: string, adminNote?: string, userId?: string) {
  if (action === RefundStatus.Approved) return approveRefund(id, adminNote || "");
  return rejectRefund(id, adminNote, userId);
}
export async function confirmReturn(id: string, userId?: string) {
  return completeRefund(id);
}

export interface PosOriginalOrder {
  id: string;
  storeId: string | null;
  source: string;
  status: string;
  total: string;
  refundedTotal: string;
  currency: string;
}

export interface PosOriginalItem {
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
  transaction: (work) => db.transaction(work),
  findOpenShiftId,
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
    }).from(orders).where(eq(orders.id, orderId)).for('update').limit(1);
    return order ?? null;
  },
  async lockOriginalItems(orderId, tx) {
    const rows = await tx.select({
      id: orderItems.id,
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
    const prepared = await preparePosReturn({
      orderId: input.order_id,
      storeId: input.store_id,
      returnItems: input.return_items,
    }, dependencies, tx);
    const refundId = dependencies.newId();
    const shiftId = await dependencies.findOpenShiftId(input.store_id, tx);
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
      payload: { order_id: prepared.order.id, amount: prepared.amount, shift_id: shiftId },
    });
    return {
      refund_id: refundId,
      order_id: prepared.order.id,
      amount: prepared.amount,
      refunded_total: prepared.refundedTotal,
      items: input.return_items,
    };
  }), {
    responseStatus: 201,
    resourceType: 'refund',
    resourceId: (result) => result.refund_id,
  });
}

export { approvalHash, databasePosReturnDependencies };
