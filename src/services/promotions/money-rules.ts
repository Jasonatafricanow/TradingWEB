/**
 * Pure money rules for membership discount, wallet and affiliate commission.
 * All amounts are integer cents; percentages are basis points (1% = 100).
 */

export interface TierRule {
  id: string;
  level: number;
  minSpentCents: number;
  discountBps: number;
  isActive: boolean;
  discountStartsAt: Date | null;
  discountEndsAt: Date | null;
}

export interface AssignedTier {
  tierId: string | null;
  until: Date | null;
}

/** start is inclusive, end is exclusive; null means open-ended. */
export function inWindow(now: Date, start: Date | null, end: Date | null): boolean {
  if (start && now < start) return false;
  if (end && now >= end) return false;
  return true;
}

export function percentToBps(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(10_000, Math.round(n * 100));
}

/**
 * The member's tier: the higher of the tier earned by spend and a tier an
 * admin assigned that has not expired. Inactive tiers never count.
 */
export function resolveMemberTier(input: {
  tiers: TierRule[];
  spentCents: number;
  assigned: AssignedTier | null;
  now: Date;
}): TierRule | null {
  const active = input.tiers.filter((tier) => tier.isActive);
  const earned = active
    .filter((tier) => input.spentCents >= tier.minSpentCents)
    .sort((a, b) => b.level - a.level)[0] ?? null;
  const assignedValid = input.assigned?.tierId && inWindow(input.now, null, input.assigned.until)
    ? active.find((tier) => tier.id === input.assigned?.tierId) ?? null
    : null;
  if (!earned) return assignedValid;
  if (!assignedValid) return earned;
  return assignedValid.level > earned.level ? assignedValid : earned;
}

/** The tier's discount rate right now (0 outside its discount window). */
export function effectiveDiscountBps(tier: TierRule | null, now: Date): number {
  if (!tier) return 0;
  return inWindow(now, tier.discountStartsAt, tier.discountEndsAt) ? tier.discountBps : 0;
}

export function bpsOf(cents: number, bps: number): number {
  return Math.round((cents * bps) / 10_000);
}

/**
 * Combines coupon and member discount on the merchandise amount.
 * best  — whichever saves more applies alone (a tie keeps the coupon);
 * stack — both apply, the member rate on the amount left after the coupon.
 */
export function combineDiscounts(input: {
  merchandiseCents: number;
  couponCents: number;
  memberBps: number;
  stackMode: "best" | "stack";
}): { couponCents: number; memberCents: number } {
  const coupon = Math.min(Math.max(0, input.couponCents), input.merchandiseCents);
  if (input.memberBps <= 0) return { couponCents: coupon, memberCents: 0 };
  if (input.stackMode === "stack") {
    return { couponCents: coupon, memberCents: bpsOf(input.merchandiseCents - coupon, input.memberBps) };
  }
  const member = bpsOf(input.merchandiseCents, input.memberBps);
  return member > coupon ? { couponCents: 0, memberCents: member } : { couponCents: coupon, memberCents: 0 };
}

/** How much of the payable amount the wallet covers. */
export function walletShareCents(input: { payableCents: number; balanceCents: number; maxPercent: number }): number {
  if (input.payableCents <= 0 || input.balanceCents <= 0) return 0;
  const cap = Math.floor((input.payableCents * input.maxPercent) / 100);
  return Math.max(0, Math.min(input.balanceCents, cap));
}

export interface WalletLot {
  id: string;
  remainingCents: number;
  expiresAt: Date | null;
  createdAt: Date;
  revoked: boolean;
}

export function lotUsable(lot: WalletLot, now: Date): boolean {
  return !lot.revoked && lot.remainingCents > 0 && inWindow(now, null, lot.expiresAt);
}

export function walletBalanceCents(lots: WalletLot[], now: Date): number {
  return lots.filter((lot) => lotUsable(lot, now)).reduce((sum, lot) => sum + lot.remainingCents, 0);
}

export class WalletInsufficientError extends Error {
  constructor() {
    super("WALLET_INSUFFICIENT");
    this.name = "WalletInsufficientError";
  }
}

/** Spends from the lots that expire first (no expiry last), oldest first on ties. */
export function planWalletDebit(lots: WalletLot[], amountCents: number, now: Date): Array<{ creditId: string; cents: number }> {
  if (amountCents <= 0) return [];
  const usable = lots.filter((lot) => lotUsable(lot, now)).sort((a, b) => {
    const ea = a.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const eb = b.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return ea - eb || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
  });
  const plan: Array<{ creditId: string; cents: number }> = [];
  let left = amountCents;
  for (const lot of usable) {
    if (left <= 0) break;
    const take = Math.min(lot.remainingCents, left);
    plan.push({ creditId: lot.id, cents: take });
    left -= take;
  }
  if (left > 0) throw new WalletInsufficientError();
  return plan;
}

export function commissionCents(baseCents: number, rateBps: number, maxCents: number | null): number {
  if (baseCents <= 0 || rateBps <= 0) return 0;
  const raw = bpsOf(baseCents, rateBps);
  return maxCents !== null && maxCents >= 0 ? Math.min(raw, maxCents) : raw;
}

/**
 * Commission to take back for one refund. A full refund takes back whatever
 * is left; a partial refund takes back the refunded share of the order value
 * (external payment + wallet), never more than is left.
 */
export function commissionReversalCents(input: {
  commissionCents: number;
  alreadyReversedCents: number;
  refundCents: number;
  orderValueCents: number;
  full: boolean;
}): number {
  const left = Math.max(0, input.commissionCents - input.alreadyReversedCents);
  if (left === 0) return 0;
  if (input.full) return left;
  if (input.orderValueCents <= 0 || input.refundCents <= 0) return 0;
  return Math.min(left, Math.round((input.commissionCents * input.refundCents) / input.orderValueCents));
}
