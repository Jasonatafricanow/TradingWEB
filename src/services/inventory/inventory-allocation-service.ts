import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import {
  inventory,
  orderStockAllocations,
  inventoryTransactions,
} from "@/storage/database/shared/schema";
import type { DbTx } from "@/services/orders/order-pricing-service";

export interface InventoryLedgerRow {
  id: string;
  storeId: string | null;
  stock: number;
}

export interface InventoryTransactionInput {
  productId: string;
  variantId: string | null;
  quantity: number;
  beforeStock: number;
  afterStock: number;
  note: string;
  operatorId: string | null;
  referenceType: string;
  referenceId: string;
  type: "in" | "out";
}

export interface StockAllocationRow { id: string; inventoryId: string; quantity: number; restoredQuantity: number }
export interface InventoryAllocationRepository {
  saveAllocation(input: { orderId: string; inventoryId: string; productId: string; variantId: string | null; quantity: number }, tx: DbTx): Promise<void>;
  lockAllocations(orderId: string, productId: string, variantId: string | null, tx: DbTx): Promise<StockAllocationRow[]>;
  setRestoredQuantity(id: string, quantity: number, tx: DbTx): Promise<void>;
  lockInventoryRows(productId: string, variantId: string | null, tx: DbTx): Promise<InventoryLedgerRow[]>;
  setInventoryRowStock(id: string, stock: number, tx: DbTx): Promise<void>;
  insertTransaction(input: InventoryTransactionInput, tx: DbTx): Promise<void>;
}

export interface InventoryAllocationInput {
  originalOrderId?: string;
  storeId: string | null;
  lines: Array<{
    productId: string;
    variantId: string | null;
    productType: string;
    title: string;
    quantity: number;
  }>;
  operatorId: string | null;
  referenceType: string;
  referenceId: string;
  note: string;
}

export interface InventoryAllocation {
  productId: string;
  variantId: string | null;
  quantity: number;
  beforeStock: number;
  afterStock: number;
}

export class InventoryAllocationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "InventoryAllocationError";
  }
}

const databaseInventoryRepository: InventoryAllocationRepository = {
  async saveAllocation(input, tx) {
    await tx.insert(orderStockAllocations).values({ id: randomUUID(), order_id: input.orderId, inventory_id: input.inventoryId, product_id: input.productId, variant_id: input.variantId, quantity: input.quantity });
  },
  async lockAllocations(orderId, productId, variantId, tx) {
    return tx.select({ id: orderStockAllocations.id, inventoryId: orderStockAllocations.inventory_id, quantity: orderStockAllocations.quantity, restoredQuantity: orderStockAllocations.restored_quantity }).from(orderStockAllocations).where(and(
      eq(orderStockAllocations.order_id, orderId), eq(orderStockAllocations.product_id, productId),
      variantId ? eq(orderStockAllocations.variant_id, variantId) : isNull(orderStockAllocations.variant_id),
    )).for("update");
  },
  async setRestoredQuantity(id, quantity, tx) {
    await tx.update(orderStockAllocations).set({ restored_quantity: quantity }).where(eq(orderStockAllocations.id, id));
  },
  async lockInventoryRows(productId, variantId, tx) {
    const condition = variantId
      ? and(eq(inventory.product_id, productId), eq(inventory.variant_id, variantId))
      : and(eq(inventory.product_id, productId), isNull(inventory.variant_id));
    const rows = await tx.select({
      id: inventory.id,
      storeId: inventory.store_id,
      stock: inventory.stock,
    }).from(inventory).where(condition).for("update");
    return rows;
  },
  async setInventoryRowStock(id, stock, tx) {
    await tx.update(inventory).set({ stock, updated_at: new Date() }).where(eq(inventory.id, id));
  },
  async insertTransaction(input, tx) {
    await tx.insert(inventoryTransactions).values({
      id: randomUUID(),
      product_id: input.productId,
      variant_id: input.variantId,
      type: input.type,
      quantity: input.quantity,
      before_stock: input.beforeStock,
      after_stock: input.afterStock,
      note: input.note,
      operator_id: input.operatorId,
      reference_type: input.referenceType,
      reference_id: input.referenceId,
    });
  },
};

function usableRows(rows: InventoryLedgerRow[], storeId: string | null): InventoryLedgerRow[] {
  return rows
    .filter((row) => storeId === null || row.storeId === storeId || row.storeId === null)
    .sort((left, right) => {
      const leftRank = storeId !== null && left.storeId === storeId ? 0 : 1;
      const rightRank = storeId !== null && right.storeId === storeId ? 0 : 1;
      return leftRank - rightRank || right.stock - left.stock;
    });
}

export async function allocateInventory(
  input: InventoryAllocationInput,
  repository: InventoryAllocationRepository = databaseInventoryRepository,
  tx: DbTx,
): Promise<InventoryAllocation[]> {
  const allocations: InventoryAllocation[] = [];

  for (const line of input.lines) {
    if (line.productType !== "physical") continue;
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new InventoryAllocationError("QUANTITY_INVALID", "Inventory quantity must be a positive integer");
    }

    const allRows = await repository.lockInventoryRows(line.productId, line.variantId, tx);
    const rows = usableRows(allRows, input.storeId);
    const available = rows.reduce((sum, row) => sum + row.stock, 0);
    if (available < line.quantity) {
      throw new InventoryAllocationError("INSUFFICIENT_INVENTORY", `Insufficient inventory: ${line.title}`);
    }
    const beforeStock = available;
    let remaining = line.quantity;
    for (const row of rows) {
      const taken = Math.min(row.stock, remaining);
      if (taken <= 0) continue;
      await repository.setInventoryRowStock(row.id, row.stock - taken, tx);
      await repository.saveAllocation({ orderId: input.referenceId, inventoryId: row.id, productId: line.productId, variantId: line.variantId, quantity: taken }, tx);
      remaining -= taken;
    }

    const allocation = {
      productId: line.productId,
      variantId: line.variantId,
      quantity: line.quantity,
      beforeStock,
      afterStock: beforeStock - line.quantity,
    };
    await repository.insertTransaction({
      ...allocation,
      note: input.note,
      operatorId: input.operatorId,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      type: "out",
    }, tx);
    allocations.push(allocation);
  }

  return allocations;
}

export async function restoreInventory(
  input: InventoryAllocationInput,
  repository: InventoryAllocationRepository = databaseInventoryRepository,
  tx: DbTx,
): Promise<InventoryAllocation[]> {
  const restorations: InventoryAllocation[] = [];

  for (const line of input.lines) {
    if (line.productType !== "physical") continue;
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new InventoryAllocationError("QUANTITY_INVALID", "Inventory quantity must be a positive integer");
    }

    if (!input.originalOrderId) throw new InventoryAllocationError("ORIGINAL_ALLOCATION_REQUIRED", "Original order is required for inventory restoration");
    const allocations = await repository.lockAllocations(input.originalOrderId, line.productId, line.variantId, tx);
    if (allocations.reduce((sum, row) => sum + row.quantity - row.restoredQuantity, 0) < line.quantity) {
      throw new InventoryAllocationError("ORIGINAL_ALLOCATION_REQUIRED", "No sufficient original allocation; historical returns require manual inventory reconciliation");
    }
    const rows = await repository.lockInventoryRows(line.productId, line.variantId, tx);
    if (allocations.some(a => a.quantity > a.restoredQuantity && !rows.some(row => row.id === a.inventoryId))) {
      throw new InventoryAllocationError("INVENTORY_ROW_MISSING", "Original inventory location no longer exists");
    }
    const beforeStock = rows.reduce((sum, row) => sum + row.stock, 0);
    let remaining = line.quantity;
    for (const allocation of allocations) {
      const returned = Math.min(remaining, allocation.quantity - allocation.restoredQuantity);
      if (returned <= 0) continue;
      const row = rows.find(row => row.id === allocation.inventoryId)!;
      const nextStock = row.stock + returned;
      await repository.setInventoryRowStock(row.id, nextStock, tx);
      row.stock = nextStock;
      await repository.setRestoredQuantity(allocation.id, allocation.restoredQuantity + returned, tx);
      remaining -= returned;
    }

    const restoration = {
      productId: line.productId,
      variantId: line.variantId,
      quantity: line.quantity,
      beforeStock,
      afterStock: beforeStock + line.quantity,
    };
    await repository.insertTransaction({
      ...restoration,
      note: input.note,
      operatorId: input.operatorId,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      type: "in",
    }, tx);
    restorations.push(restoration);
  }

  return restorations;
}
