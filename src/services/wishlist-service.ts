import { db } from '@/lib/db';
import { eq, desc, and } from 'drizzle-orm';
import { products, wishlistItems } from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';

export async function getWishlist(userId: string) {
  try {
    const data = await db.select().from(wishlistItems)
      .where(eq(wishlistItems.user_id, userId))
      .orderBy(desc(wishlistItems.created_at));
    return { data: data || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function addToWishlist(userId: string, productId: string) {
  try {
    const [product] = await db.select({ id: products.id }).from(products)
      .where(and(eq(products.id, productId), eq(products.status, 'active')))
      .limit(1);
    if (!product) {
      throw new Error('Product not found');
    }

    const existing = await db.select().from(wishlistItems)
      .where(and(eq(wishlistItems.user_id, userId), eq(wishlistItems.product_id, productId)))
      .limit(1);
    if (existing.length > 0) {
      return { alreadyExists: true, data: existing[0] };
    }
    const id = randomUUID();
    await db.insert(wishlistItems).values({ id, user_id: userId, product_id: productId } );
    const [data] = await db.select().from(wishlistItems).where(eq(wishlistItems.id, id)).limit(1);
    return data;
  } catch (error) {
    throw error;
  }
}

export async function removeFromWishlist(userId: string, productId: string) {
  try {
    await db.delete(wishlistItems)
      .where(and(eq(wishlistItems.user_id, userId), eq(wishlistItems.product_id, productId)));
  } catch (error) {
    throw error;
  }
}
