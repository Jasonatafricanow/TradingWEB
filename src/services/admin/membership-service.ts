import { db } from '@/lib/db';
import { eq, desc, asc } from 'drizzle-orm';
import { orders, userMemberships, membershipTiers } from '@/storage/database/shared/schema';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { IS_DEMO_MODE } from '@/config/constants';

interface AvailableCoupon {
  id: string;
  code: string;
  description: string;
  discount: string;
  expires_at: string;
  is_used: boolean;
}

export interface TierInfo {
  id: string
  name: string
  level: number
  min_total_spent: string
  discount_percent: string
  badge_color?: string
  benefits?: string
  is_active: boolean
  discount_starts_at?: Date | null
  discount_ends_at?: Date | null
}

export interface UserMembership {
  id: string
  user_id: string
  tier_id?: string
  total_spent: string
  total_orders: number
  joined_at: string
  tier?: TierInfo
}

export async function listTiers() {
  try {
    const data = await db.select().from(membershipTiers).orderBy(asc(membershipTiers.level));
    return { data: data || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function updateTier(id: string, input: Partial<TierInfo>) {
  try {
    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.min_total_spent !== undefined) updateData.min_total_spent = input.min_total_spent;
    if (input.discount_percent !== undefined) updateData.discount_percent = input.discount_percent;
    if (input.badge_color !== undefined) updateData.badge_color = input.badge_color;
    if (input.benefits !== undefined) updateData.benefits = input.benefits;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;
    if (input.discount_starts_at !== undefined) updateData.discount_starts_at = input.discount_starts_at;
    if (input.discount_ends_at !== undefined) updateData.discount_ends_at = input.discount_ends_at;

    await db.update(membershipTiers).set(updateData).where(eq(membershipTiers.id, id));
    const [data] = await db.select().from(membershipTiers).where(eq(membershipTiers.id, id)).limit(1);
    return data;
  } catch (error) {
    throw error;
  }
}

export async function createTier(input: Omit<TierInfo, 'id'>): Promise<TierInfo> {
  try {
    const id = randomUUID();
    await db.insert(membershipTiers).values({
      id,
      name: input.name,
      level: input.level,
      min_total_spent: input.min_total_spent,
      discount_percent: input.discount_percent,
      badge_color: input.badge_color || null,
      benefits: input.benefits || null,
      is_active: input.is_active ?? true,
    });
    const [data] = await db.select().from(membershipTiers).where(eq(membershipTiers.id, id)).limit(1);
    return data as unknown as TierInfo;
  } catch (error) {
    throw error;
  }
}

export async function getUserMembership(userId: string): Promise<UserMembership | null> {
  try {
    const [membership] = await db.select().from(userMemberships)
      .where(eq(userMemberships.user_id, userId)).limit(1);

    if (!membership) {
      const [defaultTier] = await db.select({ id: membershipTiers.id }).from(membershipTiers)
        .where(eq(membershipTiers.level, 1)).limit(1);

      const id = crypto.randomUUID();
      await db.insert(userMemberships).values({
        id,
        user_id: userId,
        tier_id: defaultTier?.id || null,
      });

      const [newMembership] = await db.select().from(userMemberships)
        .where(eq(userMemberships.user_id, userId)).limit(1);
      return newMembership as unknown as UserMembership;
    }

    return membership as unknown as UserMembership;
  } catch (error) {
    throw error;
  }
}

export async function recalculateTier(userId: string, currentTotalSpent: number) {
  try {
    const tiers = await db.select().from(membershipTiers)
      .where(eq(membershipTiers.is_active, true))
      .orderBy(desc(membershipTiers.level));

    let newTierId: string | null = null;
    for (const tier of tiers || []) {
      if (currentTotalSpent >= parseFloat(tier.min_total_spent)) {
        newTierId = tier.id;
        break;
      }
    }

    await db.update(userMemberships).set({
      tier_id: newTierId,
      total_spent: currentTotalSpent.toFixed(2),
    }).where(eq(userMemberships.user_id, userId));

    return newTierId;
  } catch (error) {
    throw error;
  }
}

export async function updateMembershipAfterOrder(userId: string, orderAmount: number) {
  const membership = await getUserMembership(userId);
  if (!membership) return;

  const newTotal = parseFloat(membership.total_spent || '0') + orderAmount;
  const newOrders = (membership.total_orders || 0) + 1;

  await db.update(userMemberships).set({
    total_spent: newTotal.toFixed(2),
    total_orders: newOrders,
  }).where(eq(userMemberships.user_id, userId));

  const newTierId = await recalculateTier(userId, newTotal);
  return { total_spent: newTotal, total_orders: newOrders, tier_id: newTierId };
}

export async function getUserDiscountPercent(userId: string): Promise<number> {
  const membership = await getUserMembership(userId);
  if (!membership?.tier_id) return 0;
  const [tier] = await db.select({ discount_percent: membershipTiers.discount_percent }).from(membershipTiers)
    .where(eq(membershipTiers.id, membership.tier_id)).limit(1);
  return tier ? parseFloat(tier.discount_percent || '0') : 0;
}

// Wallet: see src/services/promotions/wallet-service.ts (credit lots with expiry).

// ==================== 可用优惠券 ====================

const MOCK_COUPONS: AvailableCoupon[] = [
  { id: 'c-1', code: 'WELCOME10', description: '新用户首单 10% 折扣', discount: '10%', expires_at: new Date(Date.now() + 86400000 * 30).toISOString(), is_used: false },
  { id: 'c-2', code: 'VIP500', description: '消费满 $500 立减 $50', discount: '$50', expires_at: new Date(Date.now() + 86400000 * 15).toISOString(), is_used: false },
  { id: 'c-3', code: 'FREESHIP', description: '全场免运费', discount: '免运费', expires_at: new Date(Date.now() + 86400000 * 7).toISOString(), is_used: false },
];

export async function getUserCoupons(userId: string): Promise<AvailableCoupon[]> {
  if (IS_DEMO_MODE) {
    return MOCK_COUPONS.filter((c) => !c.is_used && new Date(c.expires_at) > new Date());
  }
  // TODO: query from DB in production
  return [];
}
