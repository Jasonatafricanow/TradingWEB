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
  /** Same key -> at most one notification (duplicate events are ignored). */
  dedupe_key?: string | null;
}

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | DbTx;

export async function createNotification(input: CreateNotificationInput, executor: Executor = db) {
  const dedupeKey = input.dedupe_key?.slice(0, 191) || null;
  await executor.insert(notifications).values({
    id: randomUUID(),
    user_id: input.user_id,
    type: input.type,
    title: input.title.slice(0, 255),
    body: input.body || null,
    reference_type: input.reference_type || null,
    reference_id: input.reference_id || null,
    channel: input.channel || 'in_app',
    dedupe_key: dedupeKey,
  }).onDuplicateKeyUpdate({ set: { dedupe_key: dedupeKey } });
  return { success: true };
}

export async function getUserNotifications(userId: string, limit = 50, unreadOnly = false) {
  const query = unreadOnly
    ? db.select().from(notifications).where(and(eq(notifications.user_id, userId), eq(notifications.is_read, false)))
    : db.select().from(notifications).where(eq(notifications.user_id, userId));
  return await query.orderBy(desc(notifications.created_at)).limit(limit);
}

export async function markAsRead(notificationId: string, userId: string) {
  await db.update(notifications)
    .set({ is_read: true, read_at: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.user_id, userId)));
  return { success: true };
}

export async function markAllAsRead(userId: string) {
  await db.update(notifications).set({ is_read: true, read_at: new Date() }).where(and(eq(notifications.user_id, userId), eq(notifications.is_read, false)));
  return { success: true };
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
