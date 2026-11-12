import { db } from "@/lib/db";
import type { orders } from "@/storage/database/shared/schema";
import { getProgramSettings } from "./program-settings";
import { reverseCommissionForRefund } from "./commission-ledger";
import { restoreWalletForOrder } from "./wallet-service";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Money effects of a completed web refund, inside the refund transaction:
 * the refunded share of the commission is taken back, and once the external
 * payment is fully refunded the wallet share of the order goes back to the
 * wallet. Both are idempotent per refund key / order.
 */
export async function applyRefundMoneyEffects(
  order: typeof orders.$inferSelect,
  refund: { key: string; cents: number; full: boolean },
  tx: Tx,
) {
  const commission = await reverseCommissionForRefund({
    order,
    refundId: refund.key,
    refundCents: refund.cents,
    full: refund.full,
  }, tx);
  let walletRestoredCents = 0;
  if (refund.full) {
    const programs = await getProgramSettings(tx);
    walletRestoredCents = await restoreWalletForOrder(order.id, tx, {
      graceDays: programs.wallet.restoreGraceDays,
      reason: `refund ${refund.key}`,
    });
  }
  return { commission, walletRestoredCents };
}
