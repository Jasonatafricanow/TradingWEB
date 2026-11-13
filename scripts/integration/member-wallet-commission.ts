/**
 * Member discount / wallet / affiliate commission on a disposable MySQL.
 *
 *   MONEY_EXPERIMENT_ALLOW_DISPOSABLE_DB=1 DB_HOST=… DB_USER=… DB_PASSWORD=… DB_NAME=tw_replay_<x> \
 *   pnpm tsx scripts/integration/member-wallet-commission.ts
 *
 * Run replay-latest.ts first (it creates the schema). Goes through real
 * createOrder / markOrderPaidIfNotAlready / refund effects / cancellation
 * and checks every balance afterwards.
 */
import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";

import { db } from "@/lib/db";
import { cancelUnpaidOrder, createOrder, markOrderPaidIfNotAlready } from "@/services/orders/order-service";
import { updateProgramSettings } from "@/services/promotions/program-settings";
import { getWalletBalanceCents, grantWalletCredit } from "@/services/promotions/wallet-service";
import { matureDueCommissions } from "@/services/promotions/commission-ledger";
import { applyRefundMoneyEffects } from "@/services/promotions/refund-effects";
import { loadManagerGrant, saveManagerGrant } from "@/services/admin/role-permissions-service";
import { readFile } from "node:fs/promises";
import { orders, walletCredits } from "@/storage/database/shared/schema";
import { updateTier } from "@/services/admin/membership-service";
import { and, eq } from "drizzle-orm";

if (process.env.MONEY_EXPERIMENT_ALLOW_DISPOSABLE_DB !== "1" || !/^tw_replay_[a-z0-9_]+$/.test(process.env.DB_NAME ?? "")) {
  throw new Error("refusing to run: set MONEY_EXPERIMENT_ALLOW_DISPOSABLE_DB=1 and DB_NAME=tw_replay_*");
}
const admin = mysql.createPool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});
const q = async <T>(sqlText: string, params: unknown[] = []) => (await admin.query(sqlText, params))[0] as T[];
const results: Array<{ name: string; ok: boolean; detail: string }> = [];
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ name, ok, detail: ok ? String(actual) : `got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}` });
};
const orderRow = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)).limit(1))[0];

async function main() {
  const buyer = randomUUID();
  const promoter = randomUUID();
  const category = randomUUID();
  const product = randomUUID();
  const affiliate = randomUUID();
  const silver = randomUUID();
  await q("INSERT INTO users (id, email) VALUES (?, ?), (?, ?)", [buyer, `${buyer}@t.test`, promoter, `${promoter}@t.test`]);
  await q("INSERT INTO categories (id, name) VALUES (?, 'c')", [category]);
  await q("INSERT INTO products (id, title, price, category_id, seller_id, status, type) VALUES (?, 'Gift card', '100.00', ?, ?, 'active', 'digital')", [product, category, promoter]);
  await q("INSERT INTO membership_tiers (id, name, level, min_total_spent, discount_percent, is_active) VALUES (?, 'Silver', 2, '0', '10.00', TRUE)", [silver]);
  await q("INSERT INTO affiliates (id, user_id, code, rate, max_commission, status) VALUES (?, ?, 'PROMO1', '5.00', NULL, 'active')", [affiliate, promoter]);
  await q("INSERT INTO coupons (id, code, type, value, is_active) VALUES (?, 'SAVE5', 'fixed', '5.00', TRUE)", [randomUUID()]);

  await updateProgramSettings({
    membership: { enabled: true, stackMode: "best" },
    wallet: { enabled: true, maxPercent: 100, restoreGraceDays: 30 },
    affiliate: { enabled: true, holdDays: 14 },
  }, null);
  await grantWalletCredit({ userId: buyer, amountCents: 30_00, expiresAt: new Date(Date.now() + 86_400_000), note: "soon", actorId: null });
  await grantWalletCredit({ userId: buyer, amountCents: 50_00, expiresAt: null, note: "never", actorId: null });

  // 1. 100.00 goods, coupon 5 vs member 10% → member wins (best); wallet pays 80 of 90; ref PROMO1.
  const o1 = await createOrder({ user_id: buyer, items: [{ product_id: product, quantity: 1 }], payment_method: "paypal",
    coupon_code: "SAVE5", use_wallet: true, affiliate_code: "PROMO1" });
  check("member discount beats coupon", [o1.member_discount_amount, o1.discount_amount, o1.coupon_id], ["10.00", null, null]);
  check("wallet share and external total", [o1.wallet_amount, o1.total_amount], ["80.00", "10.00"]);
  check("wallet spent the soon-expiring credit first", (await q<{ remaining: string; note: string }>("SELECT remaining, note FROM wallet_credits WHERE user_id = ? ORDER BY note", [buyer])).map((r) => `${r.note}:${r.remaining}`), ["never:0.00", "soon:0.00"]);
  check("order attributed", o1.affiliate_id, affiliate);

  await markOrderPaidIfNotAlready(o1.id, { payment_id: "PAYPAL-1", source: "test" });
  const ref1 = (await q<{ commission: string; status: string; base_amount: string }>("SELECT commission, status, base_amount FROM referrals WHERE order_id = ? AND kind = 'commission'", [o1.id]))[0];
  check("commission pending on goods after discount", [ref1?.base_amount, ref1?.commission, ref1?.status], ["90.00", "4.50", "pending"]);
  check("ledger has wallet + external lines", (await q<{ method: string; amount: string }>("SELECT method, amount FROM order_payments WHERE order_id = ? ORDER BY method", [o1.id])).map((r) => `${r.method}:${r.amount}`), ["paypal:10.00", "wallet:80.00"]);
  await markOrderPaidIfNotAlready(o1.id, { payment_id: "PAYPAL-1", source: "test" });
  check("paying twice records commission once", (await q<{ n: number }>("SELECT COUNT(*) n FROM referrals WHERE order_id = ?", [o1.id]))[0].n, 1);

  // 2. partial refund 4.50 of the 10 external → 5% of order value (90) → reverse 0.23 of pending commission.
  const paid1 = await orderRow(o1.id);
  await db.transaction((tx) => applyRefundMoneyEffects(paid1, { key: "r-partial", cents: 4_50, full: false }, tx));
  await db.transaction((tx) => applyRefundMoneyEffects(paid1, { key: "r-partial", cents: 4_50, full: false }, tx));
  check("partial refund reverses its share once", (await q<{ commission: string }>("SELECT commission FROM referrals WHERE order_id = ? AND kind = 'reversal'", [o1.id])).map((r) => r.commission), ["-0.23"]);

  // 3. mature (pretend the hold passed) → balance gets 4.50 - 0.23.
  await q("UPDATE referrals SET available_at = NOW() - INTERVAL 1 DAY WHERE order_id = ? AND kind = 'commission'", [o1.id]);
  await matureDueCommissions();
  await matureDueCommissions();
  check("matured net commission credited once", (await q<{ balance: string }>("SELECT balance FROM affiliates WHERE id = ?", [affiliate]))[0].balance, "4.27");

  // 4. full refund → rest of commission taken from balance, wallet 80 back (to new lot: one lot expired? no → same lots).
  await db.transaction((tx) => applyRefundMoneyEffects(paid1, { key: "r-full", cents: 5_50, full: true }, tx));
  check("full refund leaves zero net commission", (await q<{ balance: string }>("SELECT balance FROM affiliates WHERE id = ?", [affiliate]))[0].balance, "0.00");
  check("full refund gives the wallet share back", await getWalletBalanceCents(buyer), 80_00);
  await db.transaction((tx) => applyRefundMoneyEffects(paid1, { key: "r-full", cents: 5_50, full: true }, tx));
  check("repeat full refund changes nothing", await getWalletBalanceCents(buyer), 80_00);

  // 5. fully wallet-paid order (90 after member discount) is paid immediately; self-referral is ignored.
  await grantWalletCredit({ userId: buyer, amountCents: 10_00, expiresAt: null, note: "top", actorId: null });
  await q("UPDATE affiliates SET user_id = ? WHERE id = ?", [buyer, affiliate]);
  const o2 = await createOrder({ user_id: buyer, items: [{ product_id: product, quantity: 1 }], payment_method: "paypal", use_wallet: true, affiliate_code: "PROMO1" });
  check("fully wallet-paid order", [o2.payment_status, o2.payment_method, o2.total_amount, o2.wallet_amount, o2.affiliate_id], ["paid", "wallet", "0.00", "90.00", null]);
  check("wallet empty after it", await getWalletBalanceCents(buyer), 0);
  await q("UPDATE affiliates SET user_id = ? WHERE id = ?", [promoter, affiliate]);

  // 6. unpaid order cancelled → wallet back, once; an expired lot comes back as a new lot.
  await grantWalletCredit({ userId: buyer, amountCents: 20_00, expiresAt: new Date(Date.now() + 86_400_000), note: "c", actorId: null });
  const o3 = await createOrder({ user_id: buyer, items: [{ product_id: product, quantity: 1 }], payment_method: "cod", buyer_phone: "123", use_wallet: true });
  check("cod order took 20 from wallet", [o3.wallet_amount, await getWalletBalanceCents(buyer)], ["20.00", 0]);
  // Times go through the same layer the app uses (drizzle timestamp columns).
  await db.update(walletCredits).set({ expires_at: new Date(Date.now() - 60_000) })
    .where(and(eq(walletCredits.user_id, buyer), eq(walletCredits.note, "c")));
  check("cancel returns true once", [await cancelUnpaidOrder(o3.id, "test"), await cancelUnpaidOrder(o3.id, "test")], [true, false]);
  check("expired lot restored as a new 30-day lot", (await q<{ source: string; remaining: string }>("SELECT source, remaining FROM wallet_credits WHERE order_id = ?", [o3.id])).map((r) => `${r.source}:${r.remaining}`), ["restore:20.00"]);
  check("balance after cancel", await getWalletBalanceCents(buyer), 20_00);

  // 7. tier discount outside its window → no member discount; coupon applies.
  await updateTier(silver, { discount_ends_at: new Date(Date.now() - 60_000) });
  const o4 = await createOrder({ user_id: buyer, items: [{ product_id: product, quantity: 1 }], payment_method: "paypal", coupon_code: "SAVE5" });
  check("expired tier discount → coupon only", [o4.member_discount_amount, o4.discount_amount, o4.total_amount], [null, "5.00", "95.00"]);

  // 8. programs off → plain price even with wallet and ref.
  await updateProgramSettings({ membership: { enabled: false }, wallet: { enabled: false }, affiliate: { enabled: false } }, null);
  const o5 = await createOrder({ user_id: buyer, items: [{ product_id: product, quantity: 1 }], payment_method: "paypal", use_wallet: true, affiliate_code: "PROMO1" });
  check("programs off", [o5.member_discount_amount, o5.wallet_amount, o5.affiliate_id, o5.total_amount], [null, "0.00", null, "100.00"]);

  // 9. manager grant round-trips through site_settings and is audited.
  await saveManagerGrant({ all: false, sections: ["orders", "bogus"] }, null);
  check("manager grant saved (unknown ids dropped)", await loadManagerGrant(), { all: false, sections: ["orders"] });
  check("grant change audited", (await q<{ n: number }>("SELECT COUNT(*) n FROM audit_logs WHERE action = 'role_permissions.update'"))[0].n, 1);

  // 10. 0040 runs again on an already-migrated database without error.
  const statements = (await readFile("drizzle/0040_member_wallet_commission.sql", "utf8")).split("--> statement-breakpoint").map((x) => x.trim()).filter(Boolean);
  let rerun = "ok";
  try { for (const statement of statements) await admin.query(statement); } catch (e) { rerun = (e as Error).message; }
  check("0040 re-runs cleanly", rerun, "ok");

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  (${r.detail})`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} passed`);
  await admin.end();
  process.exit(failed ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await admin.end();
  process.exit(1);
});
