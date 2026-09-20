import { db } from '@/lib/db';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { coupons } from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';

export interface Coupon {
  id: string
  code: string
  type: "percentage" | "fixed"
  value: string
  min_order_amount: string
  max_discount?: string
  usage_limit: number
  used_count: number
  expires_at?: string
  is_active: boolean
  campaign_source?: string
  campaign_name?: string
  customer_segment?: string
  description?: string
  created_at: string
}

export interface CouponInput {
  code: string
  type: "percentage" | "fixed"
  value: string
  min_order_amount?: string
  max_discount?: string
  usage_limit?: number
  expires_at?: string
  campaign_source?: string
  campaign_name?: string
  customer_segment?: string
  description?: string
  is_active?: boolean
}

export interface BatchCouponInput {
  prefix: string
  count: number
  type: "percentage" | "fixed"
  value: string
  min_order_amount?: string
  max_discount?: string
  usage_limit?: number
  expires_at?: string
  campaign_source?: string
  campaign_name?: string
  customer_segment?: string
  description?: string
}

export interface CouponValidation {
  valid: boolean
  coupon?: Coupon
  discount?: number
  message?: string
}

function parseNonNegativeAmount(value: unknown, fallback = 0): number {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) return fallback
  return amount
}

function toCoupon(row: typeof coupons.$inferSelect): Coupon {
  return {
    id: row.id,
    code: row.code,
    type: row.type === 'fixed' ? 'fixed' : 'percentage',
    value: row.value,
    min_order_amount: row.min_order_amount || '0',
    max_discount: row.max_discount || undefined,
    usage_limit: row.usage_limit || 0,
    used_count: row.used_count || 0,
    expires_at: row.expires_at ? row.expires_at.toISOString() : undefined,
    is_active: row.is_active,
    campaign_source: row.campaign_source || undefined,
    campaign_name: row.campaign_name || undefined,
    customer_segment: row.customer_segment || undefined,
    description: row.description || undefined,
    created_at: row.created_at.toISOString(),
  }
}

export async function listCoupons(options: {
  page?: number;
  pageSize?: number;
  search?: string;
  isActive?: boolean;
} = {}) {
  try {
    const page = Math.max(1, Math.floor(options.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Math.floor(options.pageSize ?? 50)));
    const offset = (page - 1) * pageSize;

    const whereParts = [] as ReturnType<typeof eq>[];
    if (typeof options.isActive === "boolean") {
      whereParts.push(eq(coupons.is_active, options.isActive));
    }
    if (options.search) {
      const q = `%${options.search}%`;
      // 命中 code / description / campaign_name 三个常见查询字段。
      whereParts.push(
        or(
          like(coupons.code, q),
          like(coupons.description, q),
          like(coupons.campaign_name, q),
        )!,
      );
    }
    const whereExpr = whereParts.length === 0
      ? undefined
      : whereParts.length === 1
        ? whereParts[0]
        : and(...whereParts);

    const totalQuery = whereExpr
      ? db.select({ total: sql<number>`COUNT(*)` }).from(coupons).where(whereExpr)
      : db.select({ total: sql<number>`COUNT(*)` }).from(coupons);
    const [{ total }] = await totalQuery;

    const listQuery = whereExpr
      ? db.select().from(coupons).where(whereExpr)
      : db.select().from(coupons);
    const rows = await listQuery
      .orderBy(desc(coupons.created_at))
      .limit(pageSize)
      .offset(offset);

    return {
      data: rows || [],
      total: Number(total) || 0,
      page,
      pageSize,
      error: null,
    };
  } catch (error) {
    return { data: [], total: 0, page: 1, pageSize: 50, error };
  }
}

export async function createCoupon(input: CouponInput) {
  try {
    const [existing] = await db.select({ id: coupons.id }).from(coupons)
      .where(eq(coupons.code, input.code.toUpperCase())).limit(1);
    if (existing) throw new Error('优惠码已存在');

    const id = randomUUID();
    await db.insert(coupons).values({
      id,
      code: input.code.toUpperCase(),
      type: input.type,
      value: input.value,
      min_order_amount: input.min_order_amount || '0',
      max_discount: input.max_discount || null,
      usage_limit: input.usage_limit || 0,
      expires_at: input.expires_at ? new Date(input.expires_at) : null,
      campaign_source: input.campaign_source || null,
      campaign_name: input.campaign_name || null,
      customer_segment: input.customer_segment || null,
      description: input.description || null,
    });
    const [data] = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
    return data;
  } catch (error) {
    throw error;
  }
}

export async function updateCoupon(id: string, input: Partial<CouponInput>) {
  try {
    const updateData: Record<string, unknown> = {};
    if (input.code !== undefined) updateData.code = input.code.toUpperCase();
    if (input.type !== undefined) updateData.type = input.type;
    if (input.value !== undefined) updateData.value = input.value;
    if (input.min_order_amount !== undefined) updateData.min_order_amount = input.min_order_amount;
    if (input.max_discount !== undefined) updateData.max_discount = input.max_discount;
    if (input.usage_limit !== undefined) updateData.usage_limit = input.usage_limit;
    if (input.expires_at !== undefined) updateData.expires_at = input.expires_at;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.campaign_source !== undefined) updateData.campaign_source = input.campaign_source;
    if (input.campaign_name !== undefined) updateData.campaign_name = input.campaign_name;
    if (input.customer_segment !== undefined) updateData.customer_segment = input.customer_segment;

    await db.update(coupons).set(updateData).where(eq(coupons.id, id));
    const [data] = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
    return data;
  } catch (error) {
    throw error;
  }
}

export async function deleteCoupon(id: string) {
  try {
    await db.delete(coupons).where(eq(coupons.id, id));
  } catch (error) {
    throw error;
  }
}

export async function validateCoupon(code: string, orderAmount: number): Promise<CouponValidation> {
  try {
    const normalizedAmount = parseNonNegativeAmount(orderAmount)
    const [coupon] = await db.select().from(coupons)
      .where(eq(coupons.code, code.toUpperCase())).limit(1);

    if (!coupon) return { valid: false, message: '优惠码不存在' };
    if (!coupon.is_active) return { valid: false, message: '优惠码已失效' };

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return { valid: false, message: '优惠码已过期' };
    }

    if ((coupon.usage_limit ?? 0) > 0 && (coupon.used_count || 0) >= (coupon.usage_limit ?? 0)) {
      return { valid: false, message: '优惠码已达使用上限' };
    }

    const minAmount = parseNonNegativeAmount(coupon.min_order_amount);
    if (normalizedAmount < minAmount) {
      return { valid: false, message: `订单金额需$${minAmount.toFixed(2)} 才能使用此优惠码` };
    }

    let discount = 0;
    if (coupon.type === 'fixed') {
      discount = parseNonNegativeAmount(coupon.value);
    } else {
      const percentage = Math.min(parseNonNegativeAmount(coupon.value), 100);
      discount = normalizedAmount * (percentage / 100);
      if (coupon.max_discount) {
        discount = Math.min(discount, parseNonNegativeAmount(coupon.max_discount));
      }
    }

    discount = Math.min(discount, normalizedAmount);
    discount = Math.round(discount * 100) / 100;

    return { valid: true, coupon: toCoupon(coupon), discount, message: `优惠码可用，折扣 $${discount.toFixed(2)}` };
  } catch (error) {
    throw error;
  }
}

export async function consumeCoupon(id: string) {
  try {
    const [current] = await db.select({ used_count: coupons.used_count }).from(coupons)
      .where(eq(coupons.id, id)).limit(1);
    if (!current) throw new Error('优惠券不存在');

    await db.update(coupons).set({ used_count: (current.used_count || 0) + 1 })
      .where(eq(coupons.id, id));
  } catch (error) {
    throw error;
  }
}

export interface CouponCampaignStats {
  couponId: string
  code: string
  campaignSource: string | null
  campaignName: string | null
  usedCount: number
  totalGmv: number
  totalDiscount: number
  orderCount: number
}

export async function getCouponCampaignStats(): Promise<CouponCampaignStats[]> {
  try {
    const [rows] = await db.$client.execute(
      `SELECT
        c.id as coupon_id, c.code, c.campaign_source, c.campaign_name,
        c.used_count,
        COUNT(o.id) as order_count,
        CAST(COALESCE(SUM(o.total_amount), 0) AS DECIMAL(10,2)) as total_gmv,
        CAST(COALESCE(SUM(o.discount_amount), 0) AS DECIMAL(10,2)) as total_discount
      FROM coupons c
      LEFT JOIN orders o ON o.coupon_id = c.id AND o.status IN ('paid', 'completed')
      GROUP BY c.id, c.code, c.campaign_source, c.campaign_name, c.used_count
      ORDER BY total_gmv DESC`
    );
    return (rows as CouponCampaignStats[]) || [];
  } catch (error) {
    throw error;
  }
}

function generateBatchCode(prefix: string, index: number): string {
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${String(index + 1).padStart(3, "0")}-${suffix}`;
}

export async function batchCreateCoupons(input: BatchCouponInput) {
  const codes: string[] = [];
  const errors: { index: number; error: string }[] = [];

  for (let i = 0; i < input.count; i++) {
    let code: string;
    let lastError: Error | null = null;
    let retries = 3;
    while (retries > 0) {
      code = generateBatchCode(input.prefix, i);
      try {
        await createCoupon({
          code,
          type: input.type,
          value: input.value,
          min_order_amount: input.min_order_amount,
          max_discount: input.max_discount,
          usage_limit: input.usage_limit,
          expires_at: input.expires_at,
          campaign_source: input.campaign_source,
          campaign_name: input.campaign_name,
          customer_segment: input.customer_segment,
          description: input.description,
        });
        codes.push(code);
        lastError = null;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error("Unknown error");
        retries--;
      }
    }
    if (lastError) {
      errors.push({ index: i, error: lastError.message });
    }
  }

  return { created: codes.length, codes, errors: errors.length > 0 ? errors : undefined };
}
