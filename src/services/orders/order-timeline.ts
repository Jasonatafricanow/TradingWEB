import { db } from '@/lib/db';
import { orderTimeline } from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';

// 订单关键动作统一从这里写时间线;失败不阻塞主流程(timeline 表可能不存在)
export async function addOrderTimeline(entry: {
  order_id: string;
  action: string;
  description?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  operator_id?: string | null;
}) {
  try {
    await db.insert(orderTimeline).values({
      id: randomUUID(),
      order_id: entry.order_id,
      action: entry.action,
      description: entry.description ?? null,
      old_value: entry.old_value ?? null,
      new_value: entry.new_value ?? null,
      operator_id: entry.operator_id ?? null,
    });
  } catch (e) {
    console.error('[order-timeline] failed to record:', e);
  }
}
