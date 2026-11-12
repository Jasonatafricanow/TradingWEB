import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { formatCents, parseMoneyToCents } from "@/services/orders/order-money";
import { commissionCents, commissionReversalCents, inWindow, percentToBps } from "./money-rules";
import type { ProgramSettings } from "./program-settings";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Pick<typeof db, "execute">;

const DAY_MS = 24 * 60 * 60 * 1000;

function rowsOf<T>(result: unknown): T[] {
  return ((result as [T[]])[0] ?? []) as T[];
}

function affected(result: unknown): number {
  return (result as [{ affectedRows?: number }])[0]?.affectedRows ?? 0;
}

function cents(value: unknown): number {
  return parseMoneyToCents(Number(value ?? 0).toFixed(2));
}

interface AffiliateRow {
  id: string;
  user_id: string;
  status: string;
  rate: string;
  max_commission: string | null;
  commission_starts_at: Date | null;
  commission_ends_at: Date | null;
}

/** The affiliate a checkout is attributed to, or null (unknown, inactive or self-referral). */
export async function resolveCheckoutAffiliate(code: string | null | undefined, buyerUserId: string, executor: Executor = db): Promise<string | null> {
  const normalized = typeof code === "string" ? code.trim().slice(0, 50) : "";
  if (!normalized) return null;
  const rows = rowsOf<AffiliateRow>(await executor.execute(
    sql`SELECT id, user_id, status FROM affiliates WHERE code = ${normalized} LIMIT 1`,
  ));
  const affiliate = rows[0];
  if (!affiliate || affiliate.status !== "active" || affiliate.user_id === buyerUserId) return null;
  return affiliate.id;
}

export interface CommissionOrder {
  id: string;
  user_id: string;
  affiliate_id: string | null;
  discount_amount: string | null;
  member_discount_amount: string | null;
  total_amount: string;
  wallet_amount: string | null;
}

/** Merchandise after coupon and member discount; shipping never earns commission. */
async function commissionBaseCents(order: CommissionOrder, tx: Executor): Promise<number> {
  const rows = rowsOf<{ merchandise: string | number }>(await tx.execute(
    sql`SELECT COALESCE(SUM(subtotal), 0) AS merchandise FROM order_items WHERE order_id = ${order.id}`,
  ));
  return Math.max(0, cents(rows[0]?.merchandise) - cents(order.discount_amount) - cents(order.member_discount_amount));
}

/**
 * Records the commission for a paid order inside the payment transaction.
 * It stays pending for the hold period (refund window) and only then reaches
 * the affiliate balance. Idempotent per order.
 */
export async function accrueCommissionForPaidOrder(order: CommissionOrder, tx: Tx, settings: ProgramSettings, now = new Date()) {
  if (!settings.affiliate.enabled || !order.affiliate_id) return null;
  const affiliate = rowsOf<AffiliateRow>(await tx.execute(sql`
    SELECT id, user_id, status, rate, max_commission, commission_starts_at, commission_ends_at
    FROM affiliates WHERE id = ${order.affiliate_id} FOR UPDATE`))[0];
  if (!affiliate || affiliate.status !== "active" || affiliate.user_id === order.user_id) return null;
  if (!inWindow(now, affiliate.commission_starts_at ? new Date(affiliate.commission_starts_at) : null,
    affiliate.commission_ends_at ? new Date(affiliate.commission_ends_at) : null)) return null;

  const base = await commissionBaseCents(order, tx);
  const amount = commissionCents(base, percentToBps(affiliate.rate),
    affiliate.max_commission === null ? null : cents(affiliate.max_commission));
  if (amount <= 0) return null;

  const id = randomUUID();
  const availableAt = new Date(now.getTime() + settings.affiliate.holdDays * DAY_MS);
  const inserted = await tx.execute(sql`
    INSERT INTO referrals (id, affiliate_id, order_id, commission, rate, status, kind, base_amount, available_at, dedupe_key, created_at)
    VALUES (${id}, ${affiliate.id}, ${order.id}, ${formatCents(amount)}, ${affiliate.rate}, 'pending', 'commission',
      ${formatCents(base)}, ${availableAt}, ${`commission:${order.id}`}, ${now})
    ON DUPLICATE KEY UPDATE id = id`);
  if (affected(inserted) !== 1) return null;
  await tx.execute(sql`UPDATE affiliates SET conversions = conversions + 1 WHERE id = ${affiliate.id}`);
  if (settings.affiliate.holdDays === 0) await matureReferral(id, tx, now);
  return { referralId: id, commission: formatCents(amount), availableAt };
}

/** Moves one pending commission (net of pending reversals) into the balance. */
async function matureReferral(referralId: string, tx: Tx, now: Date): Promise<number> {
  const row = rowsOf<{ id: string; affiliate_id: string; order_id: string; commission: string }>(await tx.execute(sql`
    SELECT id, affiliate_id, order_id, commission FROM referrals
    WHERE id = ${referralId} AND kind = 'commission' AND status = 'pending' FOR UPDATE`))[0];
  if (!row) return 0;
  const reversed = rowsOf<{ total: string | number }>(await tx.execute(sql`
    SELECT COALESCE(SUM(commission), 0) AS total FROM referrals
    WHERE order_id = ${row.order_id} AND kind = 'reversal' AND status = 'pending'`))[0];
  const net = Math.max(0, cents(row.commission) + cents(reversed?.total));
  await tx.execute(sql`UPDATE referrals SET status = 'approved', matured_at = ${now} WHERE id = ${row.id}`);
  await tx.execute(sql`UPDATE referrals SET status = 'approved', matured_at = ${now}
    WHERE order_id = ${row.order_id} AND kind = 'reversal' AND status = 'pending'`);
  if (net > 0) {
    await tx.execute(sql`UPDATE affiliates SET balance = balance + ${formatCents(net)}, total_earned = total_earned + ${formatCents(net)}
      WHERE id = ${row.affiliate_id}`);
  }
  return net;
}

/** Matures every commission whose hold period has passed. Safe to run repeatedly. */
export async function matureDueCommissions(now = new Date(), limit = 500) {
  const due = rowsOf<{ id: string }>(await db.execute(sql`
    SELECT id FROM referrals WHERE kind = 'commission' AND status = 'pending'
      AND available_at IS NOT NULL AND available_at <= ${now}
    ORDER BY available_at LIMIT ${limit}`));
  let matured = 0;
  let creditedCents = 0;
  for (const { id } of due) {
    const net = await db.transaction((tx) => matureReferral(id, tx, now));
    matured += 1;
    creditedCents += net;
  }
  return { matured, credited: formatCents(creditedCents) };
}

/**
 * Takes back commission for a completed refund, inside the refund transaction.
 * Pending commission is reduced before it ever reaches the balance; matured
 * commission is deducted from the balance (which may go negative and then
 * blocks payouts until new commission covers it). Idempotent per refund.
 */
export async function reverseCommissionForRefund(input: {
  order: CommissionOrder;
  refundId: string;
  refundCents: number;
  full: boolean;
}, tx: Tx, now = new Date()) {
  const original = rowsOf<{ id: string; affiliate_id: string; commission: string; status: string; rate: string }>(await tx.execute(sql`
    SELECT id, affiliate_id, commission, status, rate FROM referrals
    WHERE dedupe_key = ${`commission:${input.order.id}`} FOR UPDATE`))[0];
  if (!original || original.status === "cancelled") return null;
  const reversedSoFar = rowsOf<{ total: string | number }>(await tx.execute(sql`
    SELECT COALESCE(SUM(commission), 0) AS total FROM referrals
    WHERE order_id = ${input.order.id} AND kind = 'reversal'`))[0];
  const commission = cents(original.commission);
  const amount = commissionReversalCents({
    commissionCents: commission,
    alreadyReversedCents: -cents(reversedSoFar?.total),
    refundCents: input.refundCents,
    orderValueCents: cents(input.order.total_amount) + cents(input.order.wallet_amount),
    full: input.full,
  });
  if (amount <= 0) return null;

  const matured = original.status === "approved" || original.status === "paid";
  const inserted = await tx.execute(sql`
    INSERT INTO referrals (id, affiliate_id, order_id, commission, rate, status, kind, dedupe_key, matured_at, created_at)
    VALUES (${randomUUID()}, ${original.affiliate_id}, ${input.order.id}, ${formatCents(-amount)}, ${original.rate},
      ${matured ? "approved" : "pending"}, 'reversal', ${`reversal:${input.refundId}`}, ${matured ? now : null}, ${now})
    ON DUPLICATE KEY UPDATE id = id`);
  if (affected(inserted) !== 1) return null;

  if (matured) {
    await tx.execute(sql`UPDATE affiliates SET balance = balance - ${formatCents(amount)}, total_earned = total_earned - ${formatCents(amount)}
      WHERE id = ${original.affiliate_id}`);
  } else if (amount + -cents(reversedSoFar?.total) >= commission) {
    // Fully taken back before it matured: nothing will ever reach the balance.
    await tx.execute(sql`UPDATE referrals SET status = 'cancelled' WHERE order_id = ${input.order.id} AND kind IN ('commission', 'reversal')`);
  }
  return { reversed: formatCents(amount), matured };
}
