import { and, eq, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { orderPayments, posRefundTenders } from '@/storage/database/shared/schema';
import type { DbTx } from '@/services/orders/order-pricing-service';
import { formatCents, parseMoneyToCents } from '@/services/orders/order-money';

/**
 * How money goes back to the customer on a POS refund (TW-10).
 *
 * Rule: a refund is returned through the original order's tenders in
 * proportion to what each tender paid, never more than that tender has
 * left after earlier refunds. A split cash + card sale refunded in part
 * therefore hands back cash for the cash share only, and the shift counts
 * exactly that cash. Exchange credit is not money and is never a refund
 * tender; an amount that no remaining real tender can absorb (a
 * replacement paid entirely by exchange credit) is returned as cash.
 *
 * Orders recorded before order_payments existed have no tender rows; they
 * fall back to the order's single payment_method, as before.
 */

export interface RefundTender {
  method: string;
  label: string;
  amount: string;
}

export interface RefundTenderBasis {
  /** Real tenders of the original sale (exchange credit excluded). */
  paid: Array<{ method: string; label: string; amountCents: number }>;
  /** Already refunded per method on this order. */
  refundedByMethod: Map<string, number>;
  /** orders.payment_method, for orders without tender rows. */
  legacyMethod: string | null;
}

export const EXCHANGE_CREDIT_METHOD = 'exchange_credit';
const CASH = 'cash';
const CASH_LABEL = 'Cash';

/** Tender method codes and labels are machine values (like 'Exchange credit'), not UI copy. */
function tender(method: string, label: string, cents: number): RefundTender {
  return { method, label, amount: formatCents(cents) };
}

export function allocateRefundTenders(amountCents: number, basis: RefundTenderBasis): RefundTender[] {
  if (amountCents <= 0) return [];
  const byMethod = new Map<string, { label: string; remaining: number; paid: number }>();
  for (const tender of basis.paid) {
    const entry = byMethod.get(tender.method) ?? { label: tender.label, remaining: 0, paid: 0 };
    entry.paid += tender.amountCents;
    byMethod.set(tender.method, entry);
  }
  if (byMethod.size === 0) {
    const method = basis.legacyMethod && basis.legacyMethod !== 'split' ? basis.legacyMethod : CASH;
    return [tender(method, method, amountCents)];
  }
  for (const [method, entry] of byMethod) {
    entry.remaining = Math.max(0, entry.paid - (basis.refundedByMethod.get(method) ?? 0));
  }

  const methods = [...byMethod.keys()];
  const capacity = methods.reduce((sum, method) => sum + byMethod.get(method)!.remaining, 0);
  const allocatable = Math.min(amountCents, capacity);
  const totalPaid = methods.reduce((sum, method) => sum + byMethod.get(method)!.paid, 0);

  // Largest remainder on the original paid shares, capped by what is left.
  const shares = methods.map((method) => {
    const exact = (allocatable * byMethod.get(method)!.paid) / totalPaid;
    return { method, cents: Math.min(Math.floor(exact), byMethod.get(method)!.remaining), fraction: exact - Math.floor(exact) };
  });
  let left = allocatable - shares.reduce((sum, share) => sum + share.cents, 0);
  const order = [...shares].sort((a, b) => b.fraction - a.fraction || a.method.localeCompare(b.method));
  while (left > 0) {
    let moved = false;
    for (const share of order) {
      if (left === 0) break;
      if (share.cents < byMethod.get(share.method)!.remaining) {
        share.cents += 1;
        left -= 1;
        moved = true;
      }
    }
    if (!moved) break;
  }

  const result = shares.filter((share) => share.cents > 0)
    .map((share) => tender(share.method, byMethod.get(share.method)!.label, share.cents));
  const unabsorbed = amountCents - allocatable;
  if (unabsorbed > 0) {
    const cash = result.find((tender) => tender.method === CASH);
    if (cash) cash.amount = formatCents(parseMoneyToCents(cash.amount) + unabsorbed);
    else result.push(tender(CASH, CASH_LABEL, unabsorbed));
  }
  return result;
}

export function cashCents(tenders: Array<{ method: string; amount: string }>): number {
  return tenders.reduce((sum, tender) => tender.method === CASH ? sum + parseMoneyToCents(tender.amount) : sum, 0);
}

/**
 * No-shift rule, matching the mobile POS ("仍要收款"): cash may move without
 * an open shift, but it then belongs to no drawer count, so the audit event
 * says so explicitly instead of the cash silently disappearing from close.
 */
export function cashOutsideShift(shiftId: string | null, cents: number): boolean {
  return cents > 0 && !shiftId;
}

export async function loadRefundTenderBasis(orderId: string, legacyMethod: string | null, tx: DbTx): Promise<RefundTenderBasis> {
  const paid = await tx.select({ method: orderPayments.method, label: orderPayments.label, amount: orderPayments.amount })
    .from(orderPayments)
    .where(and(eq(orderPayments.order_id, orderId), eq(orderPayments.status, 'recorded'), ne(orderPayments.method, EXCHANGE_CREDIT_METHOD)));
  const refunded = await tx.select({ method: posRefundTenders.method, amount: posRefundTenders.amount })
    .from(posRefundTenders).where(eq(posRefundTenders.order_id, orderId));
  const refundedByMethod = new Map<string, number>();
  for (const row of refunded) refundedByMethod.set(row.method, (refundedByMethod.get(row.method) ?? 0) + parseMoneyToCents(row.amount));
  return {
    paid: paid.map((row) => ({ method: row.method, label: row.label, amountCents: parseMoneyToCents(row.amount) })),
    refundedByMethod,
    legacyMethod,
  };
}

export async function insertRefundTenders(
  input: { refundId: string; orderId: string; tenders: RefundTender[]; createdAt: Date },
  tx: DbTx,
) {
  for (const tender of input.tenders) {
    await tx.insert(posRefundTenders).values({
      id: randomUUID(),
      refund_id: input.refundId,
      order_id: input.orderId,
      method: tender.method,
      label: tender.label,
      amount: tender.amount,
      created_at: input.createdAt,
    });
  }
}
