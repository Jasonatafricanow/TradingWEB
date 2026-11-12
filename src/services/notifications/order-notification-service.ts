import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { orderItems, staff, users } from '@/storage/database/shared/schema';
import { createNotification } from '@/services/notification-service';
import { EMAIL_TEMPLATES, STAFF_NOTIFICATIONS } from './email-messages';
import { deliverQueuedEmailSafely, enqueueEmail } from './email-service';

/**
 * Order events -> recipients.
 *
 * Staff (in-app, /admin/notifications): new paid order, payment conflict,
 * refund requested, delivery failed. Customers (email): confirmation,
 * shipped, delivered, cancelled.
 *
 * Every write carries a dedupe key derived from the event and the
 * recipient, so a duplicated payment callback or a retried admin action
 * cannot notify or email twice. Writes that run inside a business
 * transaction go through a savepoint: they commit with the business change
 * (no notification for a rolled-back payment) but their own failure never
 * blocks the business change.
 */

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | DbTx;

export interface OrderEventOrder {
  id: string;
  order_no: string;
  total_amount: string | number;
  currency?: string | null;
  store_id?: string | null;
  user_id?: string | null;
  buyer_email?: string | null;
  source?: string | null;
}

export type CustomerOrderEmail = 'shipped' | 'delivered' | 'cancelled';

async function sideEffect<T>(executor: Executor, label: string, work: (ex: Executor) => Promise<T>): Promise<T | null> {
  try {
    if (executor !== db && typeof (executor as DbTx).transaction === 'function') {
      return await (executor as DbTx).transaction(async (savepoint) => work(savepoint));
    }
    return await work(executor);
  } catch (error) {
    console.error(`[order-events] ${label} failed; business change kept`, error);
    return null;
  }
}

async function staffRecipients(order: OrderEventOrder, executor: Executor): Promise<string[]> {
  const rows = await executor.select({ user_id: staff.user_id, role: staff.role, store_id: staff.store_id })
    .from(staff)
    .where(and(eq(staff.is_active, true), inArray(staff.role, ['admin', 'operator'])));
  const ids = rows
    .filter((row) => row.user_id)
    .filter((row) => row.role === 'admin' || !row.store_id || !order.store_id || row.store_id === order.store_id)
    .map((row) => row.user_id as string);
  return [...new Set(ids)];
}

async function notifyStaff(
  order: OrderEventOrder,
  event: string,
  eventRef: string | null,
  content: { subject: string; body: string },
  executor: Executor,
) {
  const recipients = await staffRecipients(order, executor);
  for (const userId of recipients) {
    await createNotification({
      user_id: userId,
      type: 'order',
      title: content.subject,
      body: content.body,
      reference_type: 'order',
      reference_id: order.id,
      dedupe_key: eventRef ? `${event}:${eventRef}:${userId}` : null,
    }, executor);
  }
  return recipients.length;
}

async function customerEmail(order: OrderEventOrder, executor: Executor): Promise<string | null> {
  if (order.buyer_email?.includes('@')) return order.buyer_email;
  // POS walk-in orders have no customer mailbox unless one was captured.
  if (order.source === 'pos' || !order.user_id) return null;
  const [user] = await executor.select({ email: users.email }).from(users).where(eq(users.id, order.user_id)).limit(1);
  return user?.email?.includes('@') ? user.email : null;
}

/** Inside the paid transaction: staff notice + queued confirmation email. Returns the email row to deliver after commit. */
export async function recordOrderPaidEvents(order: OrderEventOrder, tx: Executor): Promise<string | null> {
  await sideEffect(tx, 'paid notification', (ex) =>
    notifyStaff(order, 'order-paid', order.id, STAFF_NOTIFICATIONS.orderPaid(order), ex));
  const queued = await sideEffect(tx, 'confirmation email', async (ex) => {
    const to = await customerEmail(order, ex);
    if (!to) return null;
    const items = await ex.select({ title: orderItems.product_title }).from(orderItems).where(eq(orderItems.order_id, order.id));
    const template = EMAIL_TEMPLATES.orderConfirmation;
    return enqueueEmail({
      to,
      subject: template.subject(order),
      body: template.body(order, items.map((item) => item.title)),
      templateKey: template.key,
      orderId: order.id,
      dedupeKey: `order-confirmation:${order.id}`,
    }, ex);
  });
  return queued && queued.created ? queued.id : null;
}

export async function recordPaymentConflictEvent(order: OrderEventOrder, tx: Executor) {
  await sideEffect(tx, 'payment conflict notification', (ex) =>
    notifyStaff(order, 'payment-conflict', order.id, STAFF_NOTIFICATIONS.paymentConflict(order), ex));
}

export async function recordRefundRequestedEvent(order: OrderEventOrder, refund: { id: string; amount: string }, tx: Executor) {
  await sideEffect(tx, 'refund notification', (ex) =>
    notifyStaff(order, 'refund-requested', refund.id, STAFF_NOTIFICATIONS.refundRequested(order, refund.amount), ex));
}

/** Delivery can fail more than once per order; callers only invoke this on a real state transition. */
export async function recordDeliveryFailedEvent(order: OrderEventOrder, reason: string | null) {
  await sideEffect(db, 'delivery failure notification', (ex) =>
    notifyStaff(order, 'delivery-failed', null, STAFF_NOTIFICATIONS.deliveryFailed(order, reason), ex));
}

/** Queue + attempt a customer status email; one per order and status. */
export async function sendCustomerOrderEmail(
  order: OrderEventOrder,
  kind: CustomerOrderEmail,
  extra: { trackingNumber?: string | null; carrier?: string | null } = {},
) {
  const queued = await sideEffect(db, `${kind} email`, async (ex) => {
    const to = await customerEmail(order, ex);
    if (!to) return null;
    const message = kind === 'shipped'
      ? {
          key: EMAIL_TEMPLATES.orderShipped.key,
          subject: EMAIL_TEMPLATES.orderShipped.subject(order),
          body: EMAIL_TEMPLATES.orderShipped.body(order, { number: extra.trackingNumber, carrier: extra.carrier }),
        }
      : kind === 'delivered'
        ? { key: EMAIL_TEMPLATES.orderDelivered.key, subject: EMAIL_TEMPLATES.orderDelivered.subject(order), body: EMAIL_TEMPLATES.orderDelivered.body(order) }
        : { key: EMAIL_TEMPLATES.orderCancelled.key, subject: EMAIL_TEMPLATES.orderCancelled.subject(order), body: EMAIL_TEMPLATES.orderCancelled.body(order) };
    return enqueueEmail({
      to,
      subject: message.subject,
      body: message.body,
      templateKey: message.key,
      orderId: order.id,
      dedupeKey: `order-${kind}:${order.id}`,
    }, ex);
  });
  if (queued?.created) await deliverQueuedEmailSafely(queued.id);
}

export { deliverQueuedEmailSafely };
