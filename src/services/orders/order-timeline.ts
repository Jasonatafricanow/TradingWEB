import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { orderTimeline } from "@/storage/database/shared/schema";
import type { DbTx } from "./order-pricing-service";

export interface OrderTimelineEntry {
  order_id: string;
  action: string;
  description?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  operator_id?: string | null;
}

export async function insertOrderTimeline(
  entry: OrderTimelineEntry,
  tx: DbTx,
): Promise<void> {
  await tx.insert(orderTimeline).values({
    id: randomUUID(),
    order_id: entry.order_id,
    action: entry.action,
    description: entry.description ?? null,
    old_value: entry.old_value ?? null,
    new_value: entry.new_value ?? null,
    operator_id: entry.operator_id ?? null,
  });
}

// Non-critical timeline writes outside a business transaction remain best-effort.
export async function addOrderTimeline(entry: OrderTimelineEntry) {
  try {
    await db.transaction((tx) => insertOrderTimeline(entry, tx));
  } catch (e) {
    console.error("[order-timeline] failed to record:", e);
  }
}
