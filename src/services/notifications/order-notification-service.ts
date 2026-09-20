import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { orders } from '@/storage/database/shared/schema';

export async function notifyOrderCreated(orderId: string) {
  try {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return;
    
    const [rows] = await db.$client.execute(
      'INSERT INTO notifications (type, title, message, metadata, created_at) VALUES (?, ?, ?, ?, NOW())',
      ['order_created', 'New Order ' + order.order_no, 'Order total: $' + order.total_amount, JSON.stringify({ order_id: orderId })]
    );
    return rows;
  } catch (error) {
    throw error;
  }
}

export async function notifyOrderStatusChanged(orderId: string, oldStatus: string, newStatus: string) {
  try {
    const [order] = await db.select({ order_no: orders.order_no }).from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return;

    const [rows] = await db.$client.execute(
      'INSERT INTO notifications (type, title, message, metadata, created_at) VALUES (?, ?, ?, ?, NOW())',
      ['order_status', 'Order ' + order.order_no + ' status changed', 'Status: ' + oldStatus + ' -> ' + newStatus, JSON.stringify({ order_id: orderId, old_status: oldStatus, new_status: newStatus })]
    );
    return rows;
  } catch (error) {
    throw error;
  }
}

export async function getNotifications(limit: number = 50) {
  try {
    const [rows] = await db.$client.execute('SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?', [String(limit)]);
    return { data: rows || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}
