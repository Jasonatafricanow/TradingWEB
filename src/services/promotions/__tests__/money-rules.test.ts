import { describe, expect, it } from "vitest";
import {
  combineDiscounts,
  commissionCents,
  commissionReversalCents,
  effectiveDiscountBps,
  planWalletDebit,
  resolveMemberTier,
  walletBalanceCents,
  walletShareCents,
  WalletInsufficientError,
  type TierRule,
  type WalletLot,
} from "../money-rules";

const day = (n: number) => new Date(Date.UTC(2026, 10, n));
const now = day(15);

const tier = (id: string, level: number, minSpentCents: number, discountBps: number, extra: Partial<TierRule> = {}): TierRule => ({
  id, level, minSpentCents, discountBps, isActive: true, discountStartsAt: null, discountEndsAt: null, ...extra,
});
const tiers = [tier("bronze", 1, 0, 0), tier("silver", 2, 100_00, 500), tier("gold", 3, 500_00, 1000)];

describe("member tier", () => {
  it("earns the highest tier the spend reaches", () => {
    expect(resolveMemberTier({ tiers, spentCents: 120_00, assigned: null, now })?.id).toBe("silver");
  });

  it("uses an assigned tier only while it is valid, and only when higher", () => {
    expect(resolveMemberTier({ tiers, spentCents: 0, assigned: { tierId: "gold", until: day(20) }, now })?.id).toBe("gold");
    expect(resolveMemberTier({ tiers, spentCents: 0, assigned: { tierId: "gold", until: day(15) }, now })?.id).toBe("bronze");
    expect(resolveMemberTier({ tiers, spentCents: 600_00, assigned: { tierId: "silver", until: null }, now })?.id).toBe("gold");
  });

  it("ignores inactive tiers", () => {
    const withInactiveGold = [...tiers.slice(0, 2), tier("gold", 3, 500_00, 1000, { isActive: false })];
    expect(resolveMemberTier({ tiers: withInactiveGold, spentCents: 900_00, assigned: { tierId: "gold", until: null }, now })?.id).toBe("silver");
  });

  it("gives no discount outside the tier's discount window", () => {
    const windowed = tier("silver", 2, 0, 500, { discountStartsAt: day(10), discountEndsAt: day(15) });
    expect(effectiveDiscountBps(windowed, day(14))).toBe(500);
    expect(effectiveDiscountBps(windowed, day(15))).toBe(0);
    expect(effectiveDiscountBps(windowed, day(9))).toBe(0);
  });
});

describe("coupon and member discount", () => {
  it("best: the larger one applies alone; a tie keeps the coupon", () => {
    expect(combineDiscounts({ merchandiseCents: 100_00, couponCents: 3_00, memberBps: 1000, stackMode: "best" }))
      .toEqual({ couponCents: 0, memberCents: 10_00 });
    expect(combineDiscounts({ merchandiseCents: 100_00, couponCents: 10_00, memberBps: 1000, stackMode: "best" }))
      .toEqual({ couponCents: 10_00, memberCents: 0 });
  });

  it("stack: member rate applies to the amount after the coupon", () => {
    expect(combineDiscounts({ merchandiseCents: 100_00, couponCents: 20_00, memberBps: 1000, stackMode: "stack" }))
      .toEqual({ couponCents: 20_00, memberCents: 8_00 });
  });
});

describe("wallet", () => {
  const lot = (id: string, remainingCents: number, expiresAt: Date | null, extra: Partial<WalletLot> = {}): WalletLot => ({
    id, remainingCents, expiresAt, createdAt: day(1), revoked: false, ...extra,
  });

  it("balance counts only unexpired, unrevoked credit", () => {
    const lots = [lot("a", 10_00, day(20)), lot("b", 5_00, day(14)), lot("c", 7_00, null, { revoked: true }), lot("d", 3_00, null)];
    expect(walletBalanceCents(lots, now)).toBe(13_00);
  });

  it("spends the credit that expires first, no-expiry last", () => {
    const lots = [lot("never", 50_00, null), lot("late", 10_00, day(30)), lot("soon", 4_00, day(16))];
    expect(planWalletDebit(lots, 12_00, now)).toEqual([
      { creditId: "soon", cents: 4_00 },
      { creditId: "late", cents: 8_00 },
    ]);
  });

  it("refuses to spend more than the usable balance", () => {
    expect(() => planWalletDebit([lot("a", 5_00, day(14)), lot("b", 5_00, null)], 6_00, now)).toThrow(WalletInsufficientError);
  });

  it("share is capped by the balance and the admin percentage", () => {
    expect(walletShareCents({ payableCents: 80_00, balanceCents: 100_00, maxPercent: 100 })).toBe(80_00);
    expect(walletShareCents({ payableCents: 80_00, balanceCents: 100_00, maxPercent: 50 })).toBe(40_00);
    expect(walletShareCents({ payableCents: 80_00, balanceCents: 15_00, maxPercent: 50 })).toBe(15_00);
  });
});

describe("commission", () => {
  it("applies the rate and the per-order cap", () => {
    expect(commissionCents(90_00, 500, null)).toBe(4_50);
    expect(commissionCents(90_00, 500, 3_00)).toBe(3_00);
  });

  it("takes back the refunded share of the order value, never more than is left", () => {
    // order value 100 (60 paid externally + 40 wallet), commission 5.00
    expect(commissionReversalCents({ commissionCents: 5_00, alreadyReversedCents: 0, refundCents: 30_00, orderValueCents: 100_00, full: false })).toBe(1_50);
    expect(commissionReversalCents({ commissionCents: 5_00, alreadyReversedCents: 4_00, refundCents: 30_00, orderValueCents: 100_00, full: false })).toBe(1_00);
    expect(commissionReversalCents({ commissionCents: 5_00, alreadyReversedCents: 1_50, refundCents: 30_00, orderValueCents: 100_00, full: true })).toBe(3_50);
  });
});
