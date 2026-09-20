import { db } from '@/lib/db';
import { eq, gte, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export async function getAbandonedCarts(hoursThreshold: number = 1) {
  try {
    const cutoff = new Date(Date.now() - hoursThreshold * 3600000).toISOString();
    const [rows] = await db.$client.execute(
      'SELECT * FROM abandoned_carts WHERE reminder_sent = 0 AND created_at < ? AND created_at > DATE_SUB(NOW(), INTERVAL 72 HOUR)',
      [cutoff]
    );
    return { data: rows || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function markReminderSent(cartId: string) {
  try {
    await db.$client.execute('UPDATE abandoned_carts SET reminder_sent = 1, reminder_sent_at = NOW() WHERE id = ?', [cartId]);
  } catch (error) {
    throw error;
  }
}

export async function updateAbandonedCart(userId: string, productId: string, quantity: number = 1) {
  try {
    const [existingRows] = await db.$client.execute(
      'SELECT id FROM abandoned_carts WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    const existing = (existingRows as Record<string, any>[])[0];

    if (existing) {
      await db.$client.execute(
        'UPDATE abandoned_carts SET quantity = quantity + ?, updated_at = NOW() WHERE id = ?',
        [quantity, existing.id]
      );
    } else {
      const id = randomUUID();
      await db.$client.execute(
        'INSERT INTO abandoned_carts (id, user_id, product_ids, quantity, reminder_sent) VALUES (?, ?, ?, ?, 0)',
        [id, userId, productId, quantity]
      );
    }
  } catch (error) {
    throw error;
  }
}

export async function removeAbandonedCart(userId: string) {
  try {
    await db.$client.execute('DELETE FROM abandoned_carts WHERE user_id = ?', [userId]);
  } catch (error) {
    throw error;
  }
}

export async function recordAbandonedCart(data: { user_id?: string; email?: string; items: unknown[]; total: number }) {
  return { success: true, user_id: data.user_id };
}
export async function markRecovered(userId: string) {
  return removeAbandonedCart(userId);
}
export async function listAbandonedCarts(options: {
  page?: number;
  pageSize?: number;
  search?: string;
  recovered?: boolean;
} = {}) {
  try {
    const page = Math.max(1, Math.floor(options.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Math.floor(options.pageSize ?? 50)));
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const params: (string | number)[] = [];
    if (options.search) {
      where.push("(email LIKE ? OR user_id LIKE ?)");
      const q = `%${options.search}%`;
      params.push(q, q);
    }
    if (typeof options.recovered === "boolean") {
      where.push("recovered = ?");
      params.push(options.recovered ? 1 : 0);
    }
    const whereSql = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";

    const [countRows] = await db.$client.execute(
      `SELECT COUNT(*) AS total FROM abandoned_carts${whereSql}`,
      params,
    );
    const total = Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0);

    const [rows] = await db.$client.execute(
      `SELECT * FROM abandoned_carts${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    return {
      data: (rows as Record<string, unknown>[]) || [],
      total,
      page,
      pageSize,
      error: null,
    };
  } catch (error) {
    return { data: [], total: 0, page: 1, pageSize: 50, error };
  }
}
export async function triggerAbandonedCartCheck() {
  return { processed: 0 };
}
