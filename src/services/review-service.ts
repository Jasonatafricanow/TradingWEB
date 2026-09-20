import { db } from '@/lib/db';
import { eq, desc, and, like, or, sql } from 'drizzle-orm';
import { products, productReviews } from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';

export async function getProductReviews(productId: string) {
  try {
    const data = await db.select().from(productReviews)
      .where(and(eq(productReviews.product_id, productId), eq(productReviews.is_approved, true)))
      .orderBy(desc(productReviews.created_at));
    return { data: data || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function createReview(input: {
  product_id: string; user_id: string; rating: number; title?: string; content?: string; is_verified?: boolean
}) {
  try {
    const [product] = await db.select({ id: products.id }).from(products)
      .where(and(eq(products.id, input.product_id), eq(products.status, 'active')))
      .limit(1);
    if (!product) {
      throw new Error('Product not found');
    }

    const [existingReview] = await db.select({ id: productReviews.id }).from(productReviews)
      .where(and(eq(productReviews.product_id, input.product_id), eq(productReviews.user_id, input.user_id)))
      .limit(1);
    if (existingReview) {
      throw new Error('You have already reviewed this product');
    }

    const id = randomUUID();
    await db.insert(productReviews).values({
      id,
      ...input,
      is_verified: input.is_verified ?? false,
      is_approved: false,
    });
    const [data] = await db.select().from(productReviews).where(eq(productReviews.id, id)).limit(1);
    return data;
  } catch (error) {
    throw error;
  }
}

export async function listAllReviews(options: {
  page?: number;
  pageSize?: number;
  search?: string;
  isApproved?: boolean;
} = {}) {
  try {
    const page = Math.max(1, Math.floor(options.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Math.floor(options.pageSize ?? 50)));
    const offset = (page - 1) * pageSize;

    const whereParts = [] as ReturnType<typeof eq>[];
    if (typeof options.isApproved === "boolean") {
      whereParts.push(eq(productReviews.is_approved, options.isApproved));
    }
    if (options.search) {
      const q = `%${options.search}%`;
      // 命中 title / content / 商品标题。
      whereParts.push(
        or(
          like(productReviews.title, q),
          like(productReviews.content, q),
          like(products.title, q),
        )!,
      );
    }
    const whereExpr = whereParts.length === 0
      ? undefined
      : whereParts.length === 1
        ? whereParts[0]
        : and(...whereParts);

    const totalQuery = whereExpr
      ? db.select({ total: sql<number>`COUNT(*)` })
          .from(productReviews)
          .leftJoin(products, eq(products.id, productReviews.product_id))
          .where(whereExpr)
      : db.select({ total: sql<number>`COUNT(*)` }).from(productReviews);
    const [{ total }] = await totalQuery;

    const baseList = db
      .select({
        id: productReviews.id,
        product_id: productReviews.product_id,
        user_id: productReviews.user_id,
        rating: productReviews.rating,
        title: productReviews.title,
        content: productReviews.content,
        is_approved: productReviews.is_approved,
        is_verified: productReviews.is_verified,
        created_at: productReviews.created_at,
        product_title: products.title,
      })
      .from(productReviews)
      .leftJoin(products, eq(products.id, productReviews.product_id));
    const filteredList = whereExpr ? baseList.where(whereExpr) : baseList;
    const rows = await filteredList
      .orderBy(desc(productReviews.created_at))
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

export async function approveReview(id: string, approved: boolean) {
  try {
    await db.update(productReviews).set({ is_approved: approved } ).where(eq(productReviews.id, id));
  } catch (error) {
    throw error;
  }
}

export async function deleteReview(id: string) {
  try {
    await db.delete(productReviews).where(eq(productReviews.id, id));
  } catch (error) {
    throw error;
  }
}
