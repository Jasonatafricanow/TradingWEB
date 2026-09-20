import { db } from '@/lib/db';
import { eq, desc, and } from 'drizzle-orm';
import { notifications } from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';

export interface CreateNotificationInput {
  user_id: string;
  type: string;
  title: string;
  body?: string;
  reference_type?: string;
  reference_id?: string;
  channel?: 'in_app' | 'email' | 'whatsapp';
}

export async function createNotification(input: CreateNotificationInput) {
  try {
    const id = randomUUID();
    await db.insert(notifications).values({
      id,
      user_id: input.user_id,
      type: input.type,
      title: input.title,
      body: input.body || null,
      reference_type: input.reference_type || null,
      reference_id: input.reference_id || null,
      channel: input.channel || 'in_app',
    });
    return { success: true };
  } catch (error) {
    throw error;
  }
}

export async function getUserNotifications(userId: string, limit = 50, unreadOnly = false) {
  try {
    const query = unreadOnly
      ? db.select().from(notifications).where(and(eq(notifications.user_id, userId), eq(notifications.is_read, false)))
      : db.select().from(notifications).where(eq(notifications.user_id, userId));
    return await query.orderBy(desc(notifications.created_at)).limit(limit);
  } catch (error) {
    throw error;
  }
}

export async function markAsRead(notificationId: string, userId: string) {
  try {
    await db.update(notifications)
      .set({ is_read: true, read_at: new Date() })
      .where(and(eq(notifications.id, notificationId), eq(notifications.user_id, userId)));
    return { success: true };
  } catch (error) {
    throw error;
  }
}

export async function markAllAsRead(userId: string) {
  try {
    await db.update(notifications).set({ is_read: true, read_at: new Date() }).where(and(eq(notifications.user_id, userId), eq(notifications.is_read, false)));
    return { success: true };
  } catch (error) {
    throw error;
  }
}

export async function getUnreadCount(userId: string) {
  try {
    const [result] = await db.$client.execute(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = false',
      [userId]
    );
    const rows = result as Record<string, unknown>[];
    return Number(rows[0]?.count || 0);
  } catch {
    return 0;
  }
}
