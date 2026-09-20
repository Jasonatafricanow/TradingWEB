import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import type { DbTx } from "@/services/orders/order-pricing-service";
import {
  inventory,
  inventoryTransactions,
  products,
  productVariants,
  stockTransfers,
  stores,
  transferItems,
  warehouses,
} from "@/storage/database/shared/schema";
import { enqueuePosAuditEvent, type EnqueuePosAuditEvent } from "./pos-audit-outbox-service";

export class TransferServiceError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
    this.name = "TransferServiceError";
  }
}

export interface TransferItemFact {
  productId: string;
  variantId: string | null;
  quantity: number;
  unitCost: number | null;
}

export interface TransferHeader {
  id: string;
  referenceNo: string;
  storeId: string | null;
  fromWarehouseId: string;
  toWarehouseId: string;
  status: string;
  note: string | null;
  shippingMethod: string | null;
  packagingInfo: unknown;
  totalCost: string | null;
  operatorId: string | null;
  initiatedBy: string | null;
  approvedBy: string | null;
  completedAt: Date | null;
  createdAt: Date;
}

interface TransferInventoryTarget {
  productId: string;
  variantId: string | null;
  storeId: string | null;
  warehouseId: string;
}

interface TransferInventoryRow {
  id: string;
  stock: number;
}

export interface TransferTransitionPatch {
  status: "in_transit" | "completed" | "cancelled";
  approvedBy?: string;
  completedAt?: Date;
}

export interface TransferDependencies {
  transaction<T>(work: (tx: DbTx) => Promise<T>): Promise<T>;
  validateWarehouse(warehouseId: string, tx: DbTx): Promise<boolean>;
  resolveStoreIdForWarehouse(warehouseId: string, tx: DbTx): Promise<string | null>;
  validateProductVariant(productId: string, variantId: string | null, tx: DbTx): Promise<boolean>;
  lockInventory(target: TransferInventoryTarget, tx: DbTx): Promise<TransferInventoryRow | null>;
  insertInventory(input: TransferInventoryTarget & { id: string; stock: number }, tx: DbTx): Promise<boolean>;
  updateInventory(id: string, stock: number, tx: DbTx): Promise<void>;
  insertInventoryTransaction(input: {
    id: string; productId: string; variantId: string | null; type: string; quantity: number;
    beforeStock: number; afterStock: number; operatorId: string; referenceId: string; note: string;
  }, tx: DbTx): Promise<void>;
  insertTransfer(header: TransferHeader, tx: DbTx): Promise<void>;
  insertItems(transferId: string, items: TransferItemFact[], tx: DbTx): Promise<void>;
  lockTransfer(id: string, tx: DbTx): Promise<TransferHeader | null>;
  listItems(transferId: string, tx: DbTx): Promise<TransferItemFact[]>;
  transitionTransfer(id: string, expectedStatus: string, patch: TransferTransitionPatch, tx: DbTx): Promise<boolean>;
  enqueueAuditEvent: EnqueuePosAuditEvent;
  newId(): string;
  newReferenceNo(now: Date): string;
  now(): Date;
}

function inventoryCondition(target: TransferInventoryTarget) {
  return and(
    eq(inventory.product_id, target.productId),
    target.variantId === null ? isNull(inventory.variant_id) : eq(inventory.variant_id, target.variantId),
    target.storeId === null ? isNull(inventory.store_id) : eq(inventory.store_id, target.storeId),
    eq(inventory.warehouse_id, target.warehouseId),
  );
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  return candidate.code === "ER_DUP_ENTRY" || candidate.errno === 1062
    || candidate.cause?.code === "ER_DUP_ENTRY" || candidate.cause?.errno === 1062;
}

function toHeader(row: typeof stockTransfers.$inferSelect): TransferHeader {
  return {
    id: row.id,
    referenceNo: row.reference_no,
    storeId: row.store_id,
    fromWarehouseId: row.from_warehouse_id,
    toWarehouseId: row.to_warehouse_id,
    status: row.status,
    note: row.note,
    shippingMethod: row.shipping_method,
    packagingInfo: row.packaging_info,
    totalCost: row.total_cost,
    operatorId: row.operator_id,
    initiatedBy: row.initiated_by,
    approvedBy: row.approved_by,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

const databaseTransferDependencies: TransferDependencies = {
  transaction: (work) => db.transaction(work),
  async validateWarehouse(warehouseId, tx) {
    const [row] = await tx.select({ id: warehouses.id }).from(warehouses).where(and(
      eq(warehouses.id, warehouseId),
      eq(warehouses.is_active, true),
    )).limit(1);
    return Boolean(row);
  },
  async resolveStoreIdForWarehouse(warehouseId, tx) {
    const rows = await tx.select({ id: stores.id }).from(stores).where(and(
      eq(stores.warehouse_id, warehouseId),
      eq(stores.status, "active"),
    )).limit(2);
    if (rows.length > 1) {
      throw new TransferServiceError("AMBIGUOUS_LOCATION_SCOPE", "Warehouse belongs to more than one active store", 409);
    }
    return rows[0]?.id ?? null;
  },
  async validateProductVariant(productId, variantId, tx) {
    const [product] = await tx.select({ id: products.id }).from(products)
      .where(eq(products.id, productId)).limit(1);
    if (!product) return false;
    if (variantId === null) return true;
    const [variant] = await tx.select({ id: productVariants.id }).from(productVariants).where(and(
      eq(productVariants.id, variantId),
      eq(productVariants.product_id, productId),
    )).limit(1);
    return Boolean(variant);
  },
  async lockInventory(target, tx) {
    const [row] = await tx.select({ id: inventory.id, stock: inventory.stock }).from(inventory)
      .where(inventoryCondition(target)).for("update").limit(1);
    return row ?? null;
  },
  async insertInventory(input, tx) {
    try {
      await tx.insert(inventory).values({
        id: input.id,
        product_id: input.productId,
        variant_id: input.variantId,
        store_id: input.storeId,
        warehouse_id: input.warehouseId,
        stock: input.stock,
        low_stock_threshold: 10,
      });
      return true;
    } catch (error) {
      if (isDuplicateKeyError(error)) return false;
      throw error;
    }
  },
  async updateInventory(id, stock, tx) {
    await tx.update(inventory).set({ stock, updated_at: new Date() }).where(eq(inventory.id, id));
  },
  async insertInventoryTransaction(input, tx) {
    await tx.insert(inventoryTransactions).values({
      id: input.id,
      product_id: input.productId,
      variant_id: input.variantId,
      type: input.type,
      quantity: input.quantity,
      before_stock: input.beforeStock,
      after_stock: input.afterStock,
      note: input.note,
      operator_id: input.operatorId,
      reference_type: "stock_transfer",
      reference_id: input.referenceId,
    });
  },
  async insertTransfer(header, tx) {
    await tx.insert(stockTransfers).values({
      id: header.id,
      reference_no: header.referenceNo,
      store_id: header.storeId,
      from_warehouse_id: header.fromWarehouseId,
      to_warehouse_id: header.toWarehouseId,
      status: header.status,
      note: header.note,
      shipping_method: header.shippingMethod,
      packaging_info: header.packagingInfo,
      total_cost: header.totalCost,
      operator_id: header.operatorId,
      initiated_by: header.initiatedBy,
      approved_by: header.approvedBy,
      completed_at: header.completedAt,
      created_at: header.createdAt,
    });
  },
  async insertItems(transferId, items, tx) {
    await tx.insert(transferItems).values(items.map((item) => ({
      id: randomUUID(),
      transfer_id: transferId,
      product_id: item.productId,
      variant_id: item.variantId,
      quantity: String(item.quantity),
      unit_cost: item.unitCost === null ? null : String(item.unitCost),
    })));
  },
  async lockTransfer(id, tx) {
    const [row] = await tx.select().from(stockTransfers).where(eq(stockTransfers.id, id)).for("update").limit(1);
    return row ? toHeader(row) : null;
  },
  async listItems(transferId, tx) {
    const rows = await tx.select({
      productId: transferItems.product_id,
      variantId: transferItems.variant_id,
      quantity: transferItems.quantity,
      unitCost: transferItems.unit_cost,
    }).from(transferItems).where(eq(transferItems.transfer_id, transferId));
    return rows.map((row) => ({
      productId: row.productId,
      variantId: row.variantId,
      quantity: Number(row.quantity),
      unitCost: row.unitCost === null ? null : Number(row.unitCost),
    }));
  },
  async transitionTransfer(id, expectedStatus, patch, tx) {
    const result = await tx.update(stockTransfers).set({
      status: patch.status,
      ...(patch.approvedBy !== undefined ? { approved_by: patch.approvedBy } : {}),
      ...(patch.completedAt !== undefined ? { completed_at: patch.completedAt } : {}),
    }).where(and(eq(stockTransfers.id, id), eq(stockTransfers.status, expectedStatus)));
    const rowsAffected = (result as unknown as Array<{ affectedRows?: number }>)[0]?.affectedRows
      ?? (result as unknown as { affectedRows?: number }).affectedRows;
    return rowsAffected === undefined ? true : rowsAffected === 1;
  },
  enqueueAuditEvent: enqueuePosAuditEvent,
  newId: randomUUID,
  newReferenceNo(now) {
    return `TF-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
  },
  now: () => new Date(),
};

export interface CreateTransferParams {
  storeId?: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  shippingMethod?: string;
  packagingInfo?: unknown;
  items: Array<{
    productId: string;
    variantId?: string | null;
    quantity: number;
    unitCost?: number;
  }>;
  note?: string;
  operatorId?: string;
}

export interface TransferResult {
  id: string;
  referenceNo: string;
  status: "pending";
  storeId: string | null;
  fromLocationId: string;
  toLocationId: string;
  operatorId: string | null;
  items: Array<{ productId: string; variantId: string | null; quantity: number }>;
}

function validateItems(items: CreateTransferParams["items"]): TransferItemFact[] {
  if (items.length === 0) throw new TransferServiceError("TRANSFER_ITEMS_REQUIRED", "Transfer items are required", 400);
  const seen = new Set<string>();
  return items.map((item) => {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new TransferServiceError("TRANSFER_QUANTITY_INVALID", "Transfer quantity must be a positive integer", 400);
    }
    if (item.unitCost !== undefined && (!Number.isFinite(item.unitCost) || item.unitCost < 0)) {
      throw new TransferServiceError("TRANSFER_UNIT_COST_INVALID", "Transfer unit cost must be non-negative", 400);
    }
    const variantId = item.variantId ?? null;
    const scope = `${item.productId}:${variantId ?? ""}`;
    if (seen.has(scope)) throw new TransferServiceError("TRANSFER_ITEM_DUPLICATE", "Transfer items must be unique", 400);
    seen.add(scope);
    return { productId: item.productId, variantId, quantity: item.quantity, unitCost: item.unitCost ?? null };
  });
}

async function requireTransfer(id: string, expectedStatus: string, dependencies: TransferDependencies, tx: DbTx) {
  const transfer = await dependencies.lockTransfer(id, tx);
  if (!transfer) throw new TransferServiceError("TRANSFER_NOT_FOUND", "Transfer not found", 404);
  if (transfer.status !== expectedStatus) {
    throw new TransferServiceError("TRANSFER_STATE_CONFLICT", `Transfer is ${transfer.status}, expected ${expectedStatus}`, 409);
  }
  return transfer;
}

async function requireInventory(target: TransferInventoryTarget, quantity: number, dependencies: TransferDependencies, tx: DbTx) {
  const row = await dependencies.lockInventory(target, tx);
  if (!row || row.stock < quantity) {
    throw new TransferServiceError("INSUFFICIENT_INVENTORY", "Insufficient inventory for transfer", 409);
  }
  return row;
}

export async function createTransfer(
  params: CreateTransferParams,
  dependencies: TransferDependencies = databaseTransferDependencies,
): Promise<TransferResult> {
  if (params.fromWarehouseId === params.toWarehouseId) {
    throw new TransferServiceError("TRANSFER_LOCATION_SAME", "Source and destination must differ", 400);
  }
  const items = validateItems(params.items);
  return dependencies.transaction(async (tx) => {
    const [sourceExists, destinationExists] = await Promise.all([
      dependencies.validateWarehouse(params.fromWarehouseId, tx),
      dependencies.validateWarehouse(params.toWarehouseId, tx),
    ]);
    if (!sourceExists || !destinationExists) {
      throw new TransferServiceError("TRANSFER_LOCATION_NOT_FOUND", "Source or destination warehouse is unavailable", 404);
    }
    const sourceStoreId = await dependencies.resolveStoreIdForWarehouse(params.fromWarehouseId, tx);
    if (params.storeId !== undefined && params.storeId !== sourceStoreId) {
      throw new TransferServiceError("LOCATION_STORE_MISMATCH", "Source warehouse is not bound to the requested store", 403);
    }
    for (const item of items) {
      if (!await dependencies.validateProductVariant(item.productId, item.variantId, tx)) {
        throw new TransferServiceError("PRODUCT_VARIANT_MISMATCH", "Product does not exist or variant does not belong to product", 400);
      }
      await requireInventory({
        productId: item.productId,
        variantId: item.variantId,
        storeId: sourceStoreId,
        warehouseId: params.fromWarehouseId,
      }, item.quantity, dependencies, tx);
    }
    const now = dependencies.now();
    const header: TransferHeader = {
      id: dependencies.newId(),
      referenceNo: dependencies.newReferenceNo(now),
      storeId: sourceStoreId,
      fromWarehouseId: params.fromWarehouseId,
      toWarehouseId: params.toWarehouseId,
      status: "pending",
      note: params.note ?? null,
      shippingMethod: params.shippingMethod ?? null,
      packagingInfo: params.packagingInfo ?? null,
      totalCost: items.some((item) => item.unitCost !== null)
        ? items.reduce((sum, item) => sum + (item.unitCost ?? 0) * item.quantity, 0).toFixed(2)
        : null,
      operatorId: params.operatorId ?? null,
      initiatedBy: params.operatorId ?? null,
      approvedBy: null,
      completedAt: null,
      createdAt: now,
    };
    await dependencies.insertTransfer(header, tx);
    await dependencies.insertItems(header.id, items, tx);
    const result: TransferResult = {
      id: header.id,
      referenceNo: header.referenceNo,
      status: "pending",
      storeId: header.storeId,
      fromLocationId: header.fromWarehouseId,
      toLocationId: header.toWarehouseId,
      operatorId: header.operatorId,
      items: items.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })),
    };
    await dependencies.enqueueAuditEvent(tx, {
      eventType: "inventory.transfer.created",
      entityType: "stock_transfer",
      entityId: header.id,
      storeId: header.storeId,
      operatorId: header.operatorId,
      payload: { ...result },
    });
    return result;
  });
}

export async function approveTransfer(
  transferId: string,
  operatorId: string,
  dependencies: TransferDependencies = databaseTransferDependencies,
): Promise<void> {
  await dependencies.transaction(async (tx) => {
    const transfer = await requireTransfer(transferId, "pending", dependencies, tx);
    const sourceStoreId = transfer.storeId ?? await dependencies.resolveStoreIdForWarehouse(transfer.fromWarehouseId, tx);
    const items = await dependencies.listItems(transferId, tx);
    if (items.length === 0) throw new TransferServiceError("TRANSFER_ITEMS_REQUIRED", "Transfer has no items", 409);
    for (const item of items) {
      if (!await dependencies.validateProductVariant(item.productId, item.variantId, tx)) {
        throw new TransferServiceError("PRODUCT_VARIANT_MISMATCH", "Product does not exist or variant does not belong to product", 400);
      }
      const target = { productId: item.productId, variantId: item.variantId, storeId: sourceStoreId, warehouseId: transfer.fromWarehouseId };
      const row = await requireInventory(target, item.quantity, dependencies, tx);
      await dependencies.updateInventory(row.id, row.stock - item.quantity, tx);
      await dependencies.insertInventoryTransaction({
        id: dependencies.newId(), productId: item.productId, variantId: item.variantId,
        type: "transfer_out", quantity: item.quantity, beforeStock: row.stock, afterStock: row.stock - item.quantity,
        operatorId, referenceId: transferId, note: `Transfer out: ${transfer.referenceNo}`,
      }, tx);
    }
    if (!await dependencies.transitionTransfer(transferId, "pending", { status: "in_transit", approvedBy: operatorId }, tx)) {
      throw new TransferServiceError("TRANSFER_STATE_CONFLICT", "Transfer state changed concurrently", 409);
    }
    await dependencies.enqueueAuditEvent(tx, {
      eventType: "inventory.transfer.approved", entityType: "stock_transfer", entityId: transferId,
      storeId: sourceStoreId, operatorId, payload: { reference_no: transfer.referenceNo, status: "in_transit" },
    });
  });
}

async function lockOrCreateInventory(
  target: TransferInventoryTarget,
  dependencies: TransferDependencies,
  tx: DbTx,
): Promise<TransferInventoryRow> {
  let row = await dependencies.lockInventory(target, tx);
  if (row) return row;
  await dependencies.insertInventory({ id: dependencies.newId(), ...target, stock: 0 }, tx);
  row = await dependencies.lockInventory(target, tx);
  if (!row) throw new TransferServiceError("INVENTORY_CREATE_CONFLICT", "Inventory row could not be selected after insert", 409);
  return row;
}

export async function completeTransfer(
  transferId: string,
  operatorId: string,
  dependencies: TransferDependencies = databaseTransferDependencies,
): Promise<void> {
  await dependencies.transaction(async (tx) => {
    const transfer = await requireTransfer(transferId, "in_transit", dependencies, tx);
    const destinationStoreId = await dependencies.resolveStoreIdForWarehouse(transfer.toWarehouseId, tx);
    const items = await dependencies.listItems(transferId, tx);
    if (items.length === 0) throw new TransferServiceError("TRANSFER_ITEMS_REQUIRED", "Transfer has no items", 409);
    for (const item of items) {
      if (!await dependencies.validateProductVariant(item.productId, item.variantId, tx)) {
        throw new TransferServiceError("PRODUCT_VARIANT_MISMATCH", "Product does not exist or variant does not belong to product", 400);
      }
      const row = await lockOrCreateInventory({
        productId: item.productId, variantId: item.variantId, storeId: destinationStoreId, warehouseId: transfer.toWarehouseId,
      }, dependencies, tx);
      await dependencies.updateInventory(row.id, row.stock + item.quantity, tx);
      await dependencies.insertInventoryTransaction({
        id: dependencies.newId(), productId: item.productId, variantId: item.variantId,
        type: "transfer_in", quantity: item.quantity, beforeStock: row.stock, afterStock: row.stock + item.quantity,
        operatorId, referenceId: transferId, note: `Transfer in: ${transfer.referenceNo}`,
      }, tx);
    }
    const completedAt = dependencies.now();
    if (!await dependencies.transitionTransfer(transferId, "in_transit", { status: "completed", completedAt }, tx)) {
      throw new TransferServiceError("TRANSFER_STATE_CONFLICT", "Transfer state changed concurrently", 409);
    }
    await dependencies.enqueueAuditEvent(tx, {
      eventType: "inventory.transfer.completed", entityType: "stock_transfer", entityId: transferId,
      storeId: transfer.storeId, operatorId, payload: { reference_no: transfer.referenceNo, status: "completed" },
    });
  });
}

export async function cancelTransfer(
  transferId: string,
  operatorId: string,
  dependencies: TransferDependencies = databaseTransferDependencies,
): Promise<void> {
  await dependencies.transaction(async (tx) => {
    const transfer = await dependencies.lockTransfer(transferId, tx);
    if (!transfer) throw new TransferServiceError("TRANSFER_NOT_FOUND", "Transfer not found", 404);
    if (transfer.status !== "pending" && transfer.status !== "in_transit") {
      throw new TransferServiceError("TRANSFER_STATE_CONFLICT", `Transfer is ${transfer.status}`, 409);
    }
    if (transfer.status === "in_transit") {
      const sourceStoreId = transfer.storeId ?? await dependencies.resolveStoreIdForWarehouse(transfer.fromWarehouseId, tx);
      const items = await dependencies.listItems(transferId, tx);
      for (const item of items) {
        const row = await lockOrCreateInventory({
          productId: item.productId, variantId: item.variantId, storeId: sourceStoreId, warehouseId: transfer.fromWarehouseId,
        }, dependencies, tx);
        await dependencies.updateInventory(row.id, row.stock + item.quantity, tx);
        await dependencies.insertInventoryTransaction({
          id: dependencies.newId(), productId: item.productId, variantId: item.variantId,
          type: "transfer_revert", quantity: item.quantity, beforeStock: row.stock, afterStock: row.stock + item.quantity,
          operatorId, referenceId: transferId, note: `Transfer cancelled: ${transfer.referenceNo}`,
        }, tx);
      }
    }
    if (!await dependencies.transitionTransfer(transferId, transfer.status, { status: "cancelled" }, tx)) {
      throw new TransferServiceError("TRANSFER_STATE_CONFLICT", "Transfer state changed concurrently", 409);
    }
    await dependencies.enqueueAuditEvent(tx, {
      eventType: "inventory.transfer.cancelled", entityType: "stock_transfer", entityId: transferId,
      storeId: transfer.storeId, operatorId, payload: { reference_no: transfer.referenceNo, previous_status: transfer.status },
    });
  });
}

export async function getTransfers(opts?: { status?: string; page?: number; limit?: number }) {
  const page = opts?.page || 1;
  const limit = opts?.limit || 50;
  const offset = (page - 1) * limit;
  const whereClause = opts?.status ? "WHERE st.status = ?" : "";
  const params: string[] = opts?.status ? [opts.status] : [];
  try {
    const [countRows] = await db.$client.execute(`SELECT COUNT(*) as cnt FROM stock_transfers st ${whereClause}`, params);
    const total = Number((countRows as Array<{ cnt: number }>)[0]?.cnt || 0);
    const [rows] = await db.$client.execute(
      `SELECT st.*, wf.name as from_warehouse_name, wt.name as to_warehouse_name,
        (SELECT COUNT(*) FROM transfer_items ti WHERE ti.transfer_id = st.id) as item_count
       FROM stock_transfers st
       LEFT JOIN warehouses wf ON st.from_warehouse_id = wf.id
       LEFT JOIN warehouses wt ON st.to_warehouse_id = wt.id
       ${whereClause} ORDER BY st.created_at DESC LIMIT ? OFFSET ?`,
      [...params, String(limit), String(offset)],
    );
    return { data: rows || [], total, page, limit };
  } catch (error) {
    return { data: [], total: 0, page, limit, error };
  }
}

export async function getTransfer(id: string) {
  const [transferRows] = await db.$client.execute(
    `SELECT st.*, wf.name as from_warehouse_name, wt.name as to_warehouse_name
     FROM stock_transfers st
     LEFT JOIN warehouses wf ON st.from_warehouse_id = wf.id
     LEFT JOIN warehouses wt ON st.to_warehouse_id = wt.id
     WHERE st.id = ? LIMIT 1`, [id],
  );
  const transfer = (transferRows as Record<string, unknown>[])[0];
  if (!transfer) return null;
  const [itemRows] = await db.$client.execute(
    `SELECT ti.*, p.title as product_title, v.title as variant_title, COALESCE(v.sku, p.barcode) as sku
     FROM transfer_items ti
     JOIN products p ON ti.product_id = p.id
     LEFT JOIN product_variants v ON ti.variant_id = v.id AND v.product_id = ti.product_id
     WHERE ti.transfer_id = ?`, [id],
  );
  return { ...transfer, items: itemRows || [] };
}

export async function listTransfers() {
  return getTransfers();
}
