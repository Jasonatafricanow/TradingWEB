import { db } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { orders, shipments } from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';
import { markOrderPaidIfNotAlready } from '@/services/orders/order-service';
import { runOrderPaidSideEffects } from '@/services/orders/order-paid-effects';
import { restoreInventoryForOrder } from '@/services/orders/order-stock-service';
import { addOrderTimeline } from '@/services/orders/order-timeline';
import { createRefund } from './refund-service';
import { logAction } from './audit-service';

// P1-03:订单状态变更全部动作化。每个动作写 order_timeline,
// 敏感动作(收款确认/取消/退款)另写 audit_logs。前端不允许随意 PATCH 字段。

export class OrderActionError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

type Operator = { id: string };

async function getOrderRow(orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return order ?? null;
}

async function audit(operator: Operator, action: string, orderId: string, details: unknown) {
  try {
    await logAction({ userId: operator.id, action, entityType: 'order', entityId: orderId, details });
  } catch (e) {
    console.error('[order-actions] audit log failed:', e);
  }
}

/** 确认收款(线下/COD)。幂等:已 paid 的订单返回 changed=false */
export async function markPaidAction(orderId: string, operator: Operator) {
  const existing = await getOrderRow(orderId);
  if (!existing) throw new OrderActionError('Order not found', 404);
  if (existing.status === 'cancelled') throw new OrderActionError('已取消订单不能确认收款', 409);

  const { transitioned, order } = await markOrderPaidIfNotAlready(orderId, {
    payment_id: `manual:${operator.id}`,
  });
  if (!transitioned || !order) {
    return { order: order ?? existing, changed: false };
  }

  await runOrderPaidSideEffects(order, { source: 'admin_mark_paid', operatorId: operator.id });
  await audit(operator, 'order.mark_paid', orderId, {
    order_no: order.order_no,
    old_payment_status: existing.payment_status,
    new_payment_status: 'paid',
  });
  return { order, changed: true };
}

/** 取消订单;已扣库存则幂等回补 */
export async function cancelAction(orderId: string, operator: Operator, reason?: string) {
  const order = await getOrderRow(orderId);
  if (!order) throw new OrderActionError('Order not found', 404);
  if (order.status === 'cancelled') return { order, changed: false };
  if (order.fulfillment_status === 'fulfilled') {
    throw new OrderActionError('已发货订单不能直接取消,请走退款流程', 409);
  }

  await db.update(orders).set({ status: 'cancelled', updated_at: new Date() }).where(eq(orders.id, orderId));

  try {
    await restoreInventoryForOrder(orderId, { operatorId: operator.id, reason: '订单取消回补库存' });
  } catch (e) {
    console.error('[order-actions] restore inventory failed:', e);
  }

  await addOrderTimeline({
    order_id: orderId,
    action: 'cancelled',
    description: reason || null,
    old_value: order.status,
    new_value: 'cancelled',
    operator_id: operator.id,
  });
  await audit(operator, 'order.cancel', orderId, { order_no: order.order_no, old_status: order.status, reason: reason || null });

  return { order: await getOrderRow(orderId), changed: true };
}

/** 发货/履约完成;带运单号时同步创建 shipment */
export async function fulfillAction(
  orderId: string,
  operator: Operator,
  input: { tracking_number?: string; carrier?: string; notes?: string } = {}
) {
  const order = await getOrderRow(orderId);
  if (!order) throw new OrderActionError('Order not found', 404);
  if (order.status === 'cancelled') throw new OrderActionError('已取消订单不能发货', 409);
  if (order.fulfillment_status === 'fulfilled') return { order, changed: false };

  await db.update(orders).set({ fulfillment_status: 'fulfilled', updated_at: new Date() }).where(eq(orders.id, orderId));

  if (input.tracking_number) {
    await db.insert(shipments).values({
      id: randomUUID(),
      order_id: orderId,
      store_id: order.store_id ?? null,
      tracking_number: input.tracking_number,
      carrier: input.carrier ?? null,
      status: 'shipped',
      shipped_at: new Date(),
      notes: input.notes ?? null,
    });
  }

  await addOrderTimeline({
    order_id: orderId,
    action: 'fulfilled',
    description: input.tracking_number ? `发货,运单号 ${input.tracking_number}` : '标记为已履约',
    old_value: order.fulfillment_status,
    new_value: 'fulfilled',
    operator_id: operator.id,
  });
  await audit(operator, 'order.fulfill', orderId, {
    order_no: order.order_no,
    tracking_number: input.tracking_number || null,
    carrier: input.carrier || null,
  });

  return { order: await getOrderRow(orderId), changed: true };
}

/** 发起退款(创建 pending 退款单,审批仍走退款模块) */
export async function createRefundAction(
  orderId: string,
  operator: Operator,
  input: { amount: number | string; reason: string }
) {
  const order = await getOrderRow(orderId);
  if (!order) throw new OrderActionError('Order not found', 404);

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new OrderActionError('退款金额必须大于 0');
  if (amount > Number(order.total_amount)) throw new OrderActionError('退款金额不能超过订单金额');
  if (!input.reason || !input.reason.trim()) throw new OrderActionError('退款原因必填');

  const refund = await createRefund({
    order_id: orderId,
    amount: amount.toFixed(2),
    reason: input.reason.trim(),
    user_id: order.user_id,
    processed_by: operator.id,
  });

  await addOrderTimeline({
    order_id: orderId,
    action: 'refund_created',
    description: `发起退款 ${amount.toFixed(2)} ${order.currency}:${input.reason.trim()}`,
    new_value: amount.toFixed(2),
    operator_id: operator.id,
  });
  await audit(operator, 'order.create_refund', orderId, {
    order_no: order.order_no,
    amount: amount.toFixed(2),
    reason: input.reason.trim(),
  });

  return refund;
}

/** 内部备注(时间线流,含操作人和时间) */
export async function addNoteAction(orderId: string, operator: Operator, note: string) {
  const order = await getOrderRow(orderId);
  if (!order) throw new OrderActionError('Order not found', 404);
  if (!note || !note.trim()) throw new OrderActionError('备注内容必填');

  await addOrderTimeline({
    order_id: orderId,
    action: 'note',
    description: note.trim(),
    operator_id: operator.id,
  });
  return { ok: true };
}

/** 更新运单号:改最近一条 shipment,没有则创建 */
export async function updateTrackingAction(
  orderId: string,
  operator: Operator,
  input: { tracking_number: string; carrier?: string }
) {
  const order = await getOrderRow(orderId);
  if (!order) throw new OrderActionError('Order not found', 404);
  if (!input.tracking_number || !input.tracking_number.trim()) {
    throw new OrderActionError('运单号必填');
  }
  const trackingNumber = input.tracking_number.trim();

  const [latest] = await db
    .select()
    .from(shipments)
    .where(eq(shipments.order_id, orderId))
    .orderBy(desc(shipments.created_at))
    .limit(1);

  if (latest) {
    await db
      .update(shipments)
      .set({
        tracking_number: trackingNumber,
        carrier: input.carrier ?? latest.carrier,
        updated_at: new Date(),
      })
      .where(eq(shipments.id, latest.id));
  } else {
    await db.insert(shipments).values({
      id: randomUUID(),
      order_id: orderId,
      store_id: order.store_id ?? null,
      tracking_number: trackingNumber,
      carrier: input.carrier ?? null,
      status: 'shipped',
      shipped_at: new Date(),
    });
  }

  await addOrderTimeline({
    order_id: orderId,
    action: 'tracking_updated',
    description: `运单号更新为 ${trackingNumber}`,
    old_value: latest?.tracking_number ?? null,
    new_value: trackingNumber,
    operator_id: operator.id,
  });

  return { ok: true, tracking_number: trackingNumber };
}

/** 标记为派送中 */
export async function markDeliveringAction(orderId: string, operator: Operator) {
  const order = await getOrderRow(orderId);
  if (!order) throw new OrderActionError('Order not found', 404);
  if (order.status === 'delivering') return { order, changed: false };
  if (order.status === 'cancelled') throw new OrderActionError('已取消订单不能配送', 409);

  await db.update(orders).set({ status: 'delivering', updated_at: new Date() }).where(eq(orders.id, orderId));
  await addOrderTimeline({
    order_id: orderId, action: 'delivery', description: '开始配送',
    old_value: order.status, new_value: 'delivering', operator_id: operator.id,
  });
  return { order: await getOrderRow(orderId), changed: true };
}

/** 标记为已送达 */
export async function markDeliveredAction(orderId: string, operator: Operator) {
  const order = await getOrderRow(orderId);
  if (!order) throw new OrderActionError('Order not found', 404);
  if (order.status === 'delivered') return { order, changed: false };

  await db.update(orders).set({
    status: 'delivered', fulfillment_status: 'fulfilled', updated_at: new Date(),
  }).where(eq(orders.id, orderId));
  await addOrderTimeline({
    order_id: orderId, action: 'delivery', description: '已送达',
    old_value: order.status, new_value: 'delivered', operator_id: operator.id,
  });
  return { order: await getOrderRow(orderId), changed: true };
}

/** 标记为配送失败 */
export async function markDeliveryFailedAction(orderId: string, operator: Operator, reason?: string) {
  const order = await getOrderRow(orderId);
  if (!order) throw new OrderActionError('Order not found', 404);
  if (order.status === 'delivery_failed') return { order, changed: false };

  await db.update(orders).set({ status: 'delivery_failed', updated_at: new Date() }).where(eq(orders.id, orderId));
  await addOrderTimeline({
    order_id: orderId, action: 'delivery', description: `配送失败: ${reason || '未知原因'}`,
    old_value: order.status, new_value: 'delivery_failed', operator_id: operator.id,
  });
  return { order: await getOrderRow(orderId), changed: true };
}
