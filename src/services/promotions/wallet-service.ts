import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { walletCredits, walletTransactions } from "@/storage/database/shared/schema";
import { formatCents, parseMoneyToCents } from "@/services/orders/order-money";
import { logAction } from "@/services/admin/audit-service";
import { lotUsable, planWalletDebit, walletBalanceCents, type WalletLot } from "./money-rules";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

export class WalletError extends Error {
  constructor(public readonly code: "WALLET_CREDIT_INVALID" | "WALLET_CREDIT_NOT_FOUND", public readonly status = 400) {
    super(code);
    this.name = "WalletError";
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toLot(row: typeof walletCredits.$inferSelect): WalletLot {
  return {
    id: row.id,
    remainingCents: parseMoneyToCents(String(row.remaining)),
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at,
    revoked: row.revoked_at !== null,
  };
}

async function loadLots(userId: string, executor: Executor, forUpdate = false) {
  const query = executor.select().from(walletCredits).where(eq(walletCredits.user_id, userId));
  return forUpdate ? (query as unknown as { for(mode: "update"): Promise<Array<typeof walletCredits.$inferSelect>> }).for("update") : query;
}

export async function getWalletBalanceCents(userId: string, now = new Date(), executor: Executor = db): Promise<number> {
  const rows = await loadLots(userId, executor);
  return walletBalanceCents(rows.map(toLot), now);
}

export async function getWalletSummary(userId: string, now = new Date()) {
  const rows = await loadLots(userId, db);
  const lots = rows.map(toLot);
  const transactions = await db.select().from(walletTransactions)
    .where(eq(walletTransactions.user_id, userId))
    .orderBy(desc(walletTransactions.created_at))
    .limit(100);
  return {
    balance: formatCents(walletBalanceCents(lots, now)),
    credits: rows
      .map((row, i) => ({
        ...row,
        status: lots[i].revoked ? "revoked" : lotUsable(lots[i], now) ? "active" : lots[i].remainingCents > 0 ? "expired" : "used",
      }))
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime()),
    transactions,
  };
}

export async function grantWalletCredit(input: {
  userId: string;
  amountCents: number;
  expiresAt: Date | null;
  note: string | null;
  actorId: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > 100_000_00) {
    throw new WalletError("WALLET_CREDIT_INVALID");
  }
  if (input.expiresAt && input.expiresAt <= now) throw new WalletError("WALLET_CREDIT_INVALID");
  const id = randomUUID();
  const amount = formatCents(input.amountCents);
  await db.transaction(async (tx) => {
    await tx.insert(walletCredits).values({
      id, user_id: input.userId, amount, remaining: amount, source: "admin_grant",
      note: input.note, expires_at: input.expiresAt, created_by: input.actorId, created_at: now,
    });
    await tx.insert(walletTransactions).values({
      id: randomUUID(), user_id: input.userId, credit_id: id, type: "grant", amount,
      note: input.note, created_by: input.actorId, created_at: now,
    });
    await logAction({
      userId: input.actorId, action: "wallet.grant", entityType: "wallet_credit", entityId: id,
      details: { user_id: input.userId, amount, expires_at: input.expiresAt?.toISOString() ?? null, note: input.note },
    }, tx);
  });
  return id;
}

/** Takes back what is left of one credit (spent money is not touched). */
export async function revokeWalletCredit(creditId: string, actorId: string | null, note: string | null) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(walletCredits).where(eq(walletCredits.id, creditId)).for("update").limit(1);
    if (!row) throw new WalletError("WALLET_CREDIT_NOT_FOUND", 404);
    if (row.revoked_at) return { revoked: formatCents(0) };
    const left = parseMoneyToCents(String(row.remaining));
    const now = new Date();
    await tx.update(walletCredits).set({ remaining: "0.00", revoked_at: now }).where(eq(walletCredits.id, creditId));
    await tx.insert(walletTransactions).values({
      id: randomUUID(), user_id: row.user_id, credit_id: creditId, type: "revoke",
      amount: formatCents(-left), note, created_by: actorId, created_at: now,
    });
    await logAction({
      userId: actorId, action: "wallet.revoke", entityType: "wallet_credit", entityId: creditId,
      details: { user_id: row.user_id, revoked: formatCents(left), note },
    }, tx);
    return { revoked: formatCents(left) };
  });
}

/** Spends `cents` from the user's lots for an order, inside the order transaction. */
export async function debitWalletForOrder(userId: string, orderId: string, cents: number, tx: Tx, now = new Date()) {
  if (cents <= 0) return [];
  const rows = await loadLots(userId, tx, true);
  const plan = planWalletDebit(rows.map(toLot), cents, now);
  for (const step of plan) {
    const amount = formatCents(step.cents);
    await tx.update(walletCredits)
      .set({ remaining: sql`${walletCredits.remaining} - ${amount}` })
      .where(and(eq(walletCredits.id, step.creditId), sql`${walletCredits.remaining} >= ${amount}`));
    await tx.insert(walletTransactions).values({
      id: randomUUID(), user_id: userId, credit_id: step.creditId, order_id: orderId, type: "debit",
      amount: formatCents(-step.cents), dedupe_key: `debit:${orderId}:${step.creditId}`, created_at: now,
    });
  }
  return plan;
}

/**
 * Gives back what an order took from the wallet (cancelled unpaid order, or a
 * fully refunded order). Idempotent per order and lot. Money going back to a
 * lot that already expired or was revoked becomes a new lot that expires
 * after `graceDays`.
 */
export async function restoreWalletForOrder(orderId: string, tx: Tx, options: { graceDays: number; reason: string; now?: Date }) {
  const now = options.now ?? new Date();
  const debits = await tx.select().from(walletTransactions)
    .where(and(eq(walletTransactions.order_id, orderId), eq(walletTransactions.type, "debit")));
  let restored = 0;
  for (const debit of debits) {
    const dedupeKey = `restore:${orderId}:${debit.credit_id}`;
    const [done] = await tx.select({ id: walletTransactions.id }).from(walletTransactions)
      .where(eq(walletTransactions.dedupe_key, dedupeKey)).limit(1);
    if (done) continue;
    const cents = -parseMoneyToCents(String(debit.amount));
    if (cents <= 0) continue;
    const amount = formatCents(cents);
    const [lot] = await tx.select().from(walletCredits).where(eq(walletCredits.id, debit.credit_id)).for("update").limit(1);
    let creditId = debit.credit_id;
    if (lot && !lot.revoked_at && (!lot.expires_at || lot.expires_at > now)) {
      await tx.update(walletCredits).set({ remaining: sql`${walletCredits.remaining} + ${amount}` }).where(eq(walletCredits.id, lot.id));
    } else {
      creditId = randomUUID();
      await tx.insert(walletCredits).values({
        id: creditId, user_id: debit.user_id, amount, remaining: amount, source: "restore",
        note: options.reason, order_id: orderId, expires_at: new Date(now.getTime() + options.graceDays * DAY_MS), created_at: now,
      });
    }
    await tx.insert(walletTransactions).values({
      id: randomUUID(), user_id: debit.user_id, credit_id: creditId, order_id: orderId, type: "restore",
      amount, note: options.reason, dedupe_key: dedupeKey, created_at: now,
    });
    restored += cents;
  }
  return restored;
}
