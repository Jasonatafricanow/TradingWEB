import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, orderTimeline } from "@/storage/database/shared/schema";
import { formatCents, parseMoneyToCents } from "@/services/orders/order-money";
import { randomUUID } from "node:crypto";
import { TIMELINE_MESSAGES } from "@/lib/api-messages";
import { applyRefundMoneyEffects } from "@/services/promotions/refund-effects";

export async function reconcileStripeChargeRefund(chargeId: string) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe not configured");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const charge = await stripe.charges.retrieve(chargeId);
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) throw new Error("Refund payment identity missing");
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const orderId = intent.metadata.order_id;
  if (!orderId) throw new Error("Refund order identity missing");
  // Resolve provider identities before taking the row lock: no network calls inside the transaction.
  const [snapshot] = await db.select({ payment_id: orders.payment_id }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!snapshot?.payment_id) throw new Error("Stripe order not found");
  let originalIntent = snapshot.payment_id;
  if (originalIntent.startsWith("cs_")) {
    const session = await stripe.checkout.sessions.retrieve(originalIntent);
    originalIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || "";
  }
  return db.transaction(async tx => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update").limit(1);
    if (!order || order.payment_method !== "stripe" || order.payment_id !== snapshot.payment_id) throw new Error("Stripe order not found");
    const total = parseMoneyToCents(order.total_amount);
    if (originalIntent !== paymentIntentId || charge.currency.toUpperCase() !== order.currency.toUpperCase()
      || charge.amount !== total || !charge.paid || !Number.isSafeInteger(charge.amount_refunded)
      || charge.amount_refunded < 0 || charge.amount_refunded > total) throw new Error("Refund payment mismatch");
    // Fetch current provider state and monotonically apply its cumulative total.
    if (charge.amount_refunded <= parseMoneyToCents(order.refunded_total || "0.00")) return;
    const full = charge.amount_refunded === total;
    const previouslyRefunded = parseMoneyToCents(order.refunded_total || "0.00");
    await tx.update(orders).set({ refunded_total: formatCents(charge.amount_refunded), has_refund: true,
      financial_status: full ? "refunded" : "partially_refunded", ...(full ? { payment_status: "refunded" } : {}) }).where(eq(orders.id, orderId));
    await tx.insert(orderTimeline).values({ id: randomUUID(), order_id: orderId, action: "refund_reconciled", description: TIMELINE_MESSAGES.stripeRefundReconciled(charge.id, formatCents(charge.amount_refunded)) });
    await applyRefundMoneyEffects(order, {
      key: `stripe:${charge.id}:${charge.amount_refunded}`,
      cents: charge.amount_refunded - previouslyRefunded,
      full,
    }, tx);
  });
}
