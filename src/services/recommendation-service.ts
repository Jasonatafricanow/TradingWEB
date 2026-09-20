import { db } from '@/lib/db';
import { eq, gte, ne, and, inArray, like } from 'drizzle-orm';
import { products, orders, productRecommendations } from '@/storage/database/shared/schema';
import { pageViews } from '@/storage/database/shared/schema';
import { orderItems } from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';

export async function getRecommendations(productId: string, limit = 6) {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 6, 1), 12);
  const results: Array<typeof products.$inferSelect> = [];
  const added = new Set<string>();

  const [sourceProduct] = await db.select({ id: products.id }).from(products)
    .where(and(eq(products.id, productId), eq(products.status, 'active')))
    .limit(1);
  if (!sourceProduct) return results;

  // 1. 手动指定推荐
  const manualRecs = await db.select().from(productRecommendations)
    .where(and(eq(productRecommendations.product_id, productId), eq(productRecommendations.type, 'manual')))
    .orderBy(productRecommendations.sort_order)
    .limit(safeLimit);

  const manualProductIds = manualRecs.map(r => r.recommended_product_id).filter(Boolean);
  if (manualProductIds.length > 0) {
    const manualProducts = await db.select().from(products)
      .where(and(inArray(products.id, manualProductIds), eq(products.status, 'active')));
    for (const p of manualProducts) {
      if (!added.has(p.id)) {
        results.push(p);
        added.add(p.id);
      }
    }
  }

  if (results.length >= safeLimit) return results.slice(0, safeLimit);

  // 2. 自动推荐（基于 order_items）
  const orderRows = await db.select({ order_id: orderItems.order_id }).from(orderItems)
    .where(eq(orderItems.product_id, productId)).limit(20);

  const orderIds = [...new Set(orderRows.map(o => o.order_id))];
  if (orderIds.length > 0) {
    const relatedOrderItems = await db.select({ product_id: orderItems.product_id }).from(orderItems)
      .where(and(inArray(orderItems.order_id, orderIds), ne(orderItems.product_id, productId)))
      .limit(safeLimit * 2);

    const freq = new Map<string, number>();
    for (const item of relatedOrderItems) {
      const pid = item.product_id;
      if (!added.has(pid)) {
        freq.set(pid, (freq.get(pid) || 0) + 1);
      }
    }

    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    for (const [pid] of sorted) {
      if (results.length >= safeLimit) break;
      const [prod] = await db.select().from(products)
        .where(and(eq(products.id, pid), eq(products.status, 'active'))).limit(1);
      if (prod && !added.has(prod.id)) {
        results.push(prod);
        added.add(prod.id);
      }
    }
  }

  if (results.length >= safeLimit) return results.slice(0, safeLimit);

  // 3. 热门商品兜底
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  const recentViews = await db.select({ path: pageViews.path }).from(pageViews)
    .where(gte(pageViews.created_at, sevenDaysAgo)).limit(50);

  const pageFreq = new Map<string, number>();
  for (const v of recentViews) {
    const match = v.path.match(/\/products\/(.+)/);
    if (match) {
      const pid = match[1];
      if (!added.has(pid)) pageFreq.set(pid, (pageFreq.get(pid) || 0) + 1);
    }
  }

  const hotSorted = [...pageFreq.entries()].sort((a, b) => b[1] - a[1]);
  for (const [pid] of hotSorted) {
    if (results.length >= safeLimit) break;
    const [prod] = await db.select().from(products)
      .where(and(eq(products.id, pid), eq(products.status, 'active'))).limit(1);
    if (prod && !added.has(prod.id)) {
      results.push(prod);
      added.add(prod.id);
    }
  }

  return results.slice(0, safeLimit);
}

export async function setManualRecommendation(productId: string, recommendedId: string, sortOrder = 0) {
  try {
    const id = randomUUID();
    await db.insert(productRecommendations).values({
      id,
      product_id: productId,
      recommended_product_id: recommendedId,
      type: 'manual',
      sort_order: sortOrder,
    });
    const [data] = await db.select().from(productRecommendations).where(eq(productRecommendations.id, id)).limit(1);
    return data;
  } catch (error) {
    throw error;
  }
}

export async function removeRecommendation(id: string) {
  try {
    await db.delete(productRecommendations).where(eq(productRecommendations.id, id));
  } catch (error) {
    throw error;
  }
}

export async function getManualRecommendations(productId: string) {
  try {
    const data = await db.select().from(productRecommendations)
      .where(and(eq(productRecommendations.product_id, productId), eq(productRecommendations.type, 'manual')))
      .orderBy(productRecommendations.sort_order);
    return { data: data || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}
