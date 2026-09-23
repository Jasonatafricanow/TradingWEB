import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  inventoryTransactions,
  orderItems,
  orders,
} from "@/storage/database/shared/schema";
import {
  allocateInventory,
  restoreInventory,
} from "@/services/inventory/inventory-allocation-service";
import type { DbTx } from "./order-pricing-service";
import { addOrderTimeline } from "./order-timeline";

export interface DeductResult {
  deducted: boolean;
  reason?: "already_deducted" | "no_physical_items";
  items: { product_id: string; variant_id: string | null; quantity: number }[];
}

async function hasOrderStockTxn(orderId: string, type: "in" | "out", tx?: DbTx): Promise<boolean> {
  const executor = tx ?? db;
  const [row] = await executor.select({ id: inventoryTransactions.id })
    .from(inventoryTransactions)
    .where(and(
      eq(inventoryTransactions.reference_type, "order"),
      eq(inventoryTransactions.reference_id, orderId),
      eq(inventoryTransactions.type, type),
    ))
    .limit(1);
  return Boolean(row);
}

export async function deductInventoryForOrderInTransaction(
  orderId: string,
  opts: { operatorId?: string | null; storeId?: string | null; source?: string } = {},
  tx: DbTx,
): Promise<DeductResult> {
  if (await hasOrderStockTxn(orderId, "out", tx)) {
    return { deducted: false, reason: "already_deducted", items: [] };
  }

  const items = await tx.select().from(orderItems).where(eq(orderItems.order_id, orderId));
  const physical = items.filter((item) => item.product_type === "physical");
  if (physical.length === 0) {
    return { deducted: false, reason: "no_physical_items", items: [] };
  }

  await allocateInventory({
    storeId: opts.storeId ?? null,
    operatorId: opts.operatorId ?? null,
    referenceType: "order",
    referenceId: orderId,
    note: `Order inventory allocation (${opts.source ?? "payment"})`,
    lines: physical.map((item) => ({
      productId: item.product_id,
      variantId: item.variant_id,
      productType: item.product_type,
      title: item.product_title,
      quantity: item.quantity,
    })),
  }, undefined, tx);

  return {
    deducted: true,
    items: physical.map((item) => ({
      product_id: item.product_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
    })),
  };
}

export async function deductInventoryForOrder(
  orderId: string,
  opts: { operatorId?: string | null; storeId?: string | null; source?: string } = {},
): Promise<DeductResult> {
  const result = await db.transaction(
    (tx) => deductInventoryForOrderInTransaction(orderId, opts, tx),
  );

  if (result.deducted) {
    await addOrderTimeline({
      order_id: orderId,
      action: "stock_deducted",
      description: `Inventory allocated for ${result.items.length} item(s) (${opts.source ?? "payment"})`,
      operator_id: opts.operatorId ?? null,
    });
  }
  return result;
}

export async function restoreInventoryForOrder(
  orderId: string,
  opts: { operatorId?: string | null; reason?: string } = {},
): Promise<{ restored: boolean; reason?: "nothing_deducted" | "already_restored" }> {
  const result = await db.transaction(async (tx) => {
    if (!(await hasOrderStockTxn(orderId, "out", tx))) {
      return { restored: false, reason: "nothing_deducted" } as const;
    }
    if (await hasOrderStockTxn(orderId, "in", tx)) {
      return { restored: false, reason: "already_restored" } as const;
    }

    const [order] = await tx.select({ storeId: orders.store_id })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    const rows = await tx.select({
      productId: inventoryTransactions.product_id,
      variantId: inventoryTransactions.variant_id,
      quantity: inventoryTransactions.quantity,
    }).from(inventoryTransactions).where(and(
      eq(inventoryTransactions.reference_type, "order"),
      eq(inventoryTransactions.reference_id, orderId),
      eq(inventoryTransactions.type, "out"),
    ));

    await restoreInventory({
      storeId: order?.storeId ?? null,
      operatorId: opts.operatorId ?? null,
      referenceType: "order",
      referenceId: orderId,
      note: opts.reason ?? "Order cancellation inventory restoration",
      lines: rows.map((row) => ({
        productId: row.productId,
        variantId: row.variantId,
        productType: "physical",
        title: row.productId,
        quantity: row.quantity,
      })),
    }, undefined, tx);

    return { restored: true } as const;
  });

  if (result.restored) {
    await addOrderTimeline({
      order_id: orderId,
      action: "stock_restored",
      description: opts.reason ?? "Order cancellation inventory restoration",
      operator_id: opts.operatorId ?? null,
    });
  }
  return result;
}