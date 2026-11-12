import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { membershipTiers, userMemberships } from "@/storage/database/shared/schema";
import { parseMoneyToCents } from "@/services/orders/order-money";
import { effectiveDiscountBps, percentToBps, resolveMemberTier, type TierRule } from "./money-rules";

type Executor = Pick<typeof db, "select" | "execute">;

export function toTierRule(row: typeof membershipTiers.$inferSelect): TierRule {
  return {
    id: row.id,
    level: row.level,
    minSpentCents: parseMoneyToCents(Number(row.min_total_spent ?? 0).toFixed(2)),
    discountBps: percentToBps(row.discount_percent),
    isActive: row.is_active,
    discountStartsAt: row.discount_starts_at ?? null,
    discountEndsAt: row.discount_ends_at ?? null,
  };
}

/** Spend that counts toward a tier: paid orders (external + wallet) minus refunds. */
export async function memberSpentCents(userId: string, executor: Executor = db): Promise<number> {
  const result = await executor.execute(sql`
    SELECT COALESCE(SUM(total_amount + COALESCE(wallet_amount, 0) - COALESCE(refunded_total, 0)), 0) AS spent
    FROM orders WHERE user_id = ${userId} AND payment_status IN ('paid', 'refunded')`);
  const rows = (result as unknown as [Array<{ spent: string | number }>])[0] ?? [];
  return Math.max(0, Math.round(Number(rows[0]?.spent ?? 0) * 100));
}

export interface MemberPricing {
  tier: TierRule | null;
  tierName: string | null;
  discountBps: number;
  spentCents: number;
  assignedUntil: Date | null;
}

export async function loadMemberPricing(userId: string, now = new Date(), executor: Executor = db): Promise<MemberPricing> {
  const [tierRows, [membership], spentCents] = await Promise.all([
    executor.select().from(membershipTiers),
    executor.select().from(userMemberships).where(eq(userMemberships.user_id, userId)).limit(1),
    memberSpentCents(userId, executor),
  ]);
  const tiers = tierRows.map(toTierRule);
  const tier = resolveMemberTier({
    tiers,
    spentCents,
    assigned: membership ? { tierId: membership.assigned_tier_id ?? null, until: membership.assigned_until ?? null } : null,
    now,
  });
  return {
    tier,
    tierName: tier ? tierRows.find((row) => row.id === tier.id)?.name ?? null : null,
    discountBps: effectiveDiscountBps(tier, now),
    spentCents,
    assignedUntil: membership?.assigned_tier_id ? membership.assigned_until ?? null : null,
  };
}
