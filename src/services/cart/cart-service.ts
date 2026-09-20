import { db } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { products } from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';

export async function getCart(userId: string) {
  try {
    const [rows] = await db.$client.execute(
      'SELECT * FROM cart_items WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return { data: rows || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function addToCart(userId: string, productId: string, quantity: number = 1) {
  try {
    const [existingRows] = await db.$client.execute(
      'SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ? LIMIT 1',
      [userId, productId]
    );
    const existing = (existingRows as Record<string, any>[])[0];

    if (existing) {
      await db.$client.execute(
        'UPDATE cart_items SET quantity = ? WHERE id = ?',
        [existing.quantity + quantity, existing.id]
      );
      const [rows] = await db.$client.execute('SELECT * FROM cart_items WHERE id = ?', [existing.id]);
      return (rows as unknown as Record<string, unknown>[])[0];
    } else {
      const id = randomUUID();
      await db.$client.execute(
        'INSERT INTO cart_items (id, user_id, product_id, quantity) VALUES (?, ?, ?, ?)',
        [id, userId, productId, quantity]
      );
      const [rows] = await db.$client.execute('SELECT * FROM cart_items WHERE id = ?', [id]);
      return (rows as unknown as Record<string, unknown>[])[0];
    }
  } catch (error) {
    throw error;
  }
}

export async function updateCartItem(itemId: string, quantity: number) {
  try {
    await db.$client.execute('UPDATE cart_items SET quantity = ? WHERE id = ?', [quantity, itemId]);
    const [rows] = await db.$client.execute('SELECT * FROM cart_items WHERE id = ?', [itemId]);
    return (rows as Record<string, unknown>[])[0];
  } catch (error) {
    throw error;
  }
}

export async function removeFromCart(itemId: string) {
  try {
    await db.$client.execute('DELETE FROM cart_items WHERE id = ?', [itemId]);
  } catch (error) {
    throw error;
  }
}

export async function clearCart(userId: string) {
  try {
    await db.$client.execute('DELETE FROM cart_items WHERE user_id = ?', [userId]);
  } catch (error) {
    throw error;
  }
}
