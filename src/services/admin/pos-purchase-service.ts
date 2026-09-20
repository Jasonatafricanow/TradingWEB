import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import type { DbTx } from "@/services/orders/order-pricing-service";
import {
  inventory,
  inventoryTransactions,
  posPurchaseOrderItems,
  posPurchaseOrders,
  products,
  productVariants,
  stores,
} from "@/storage/database/shared/schema";
import { enqueuePosAuditEvent, type EnqueuePosAuditEvent } from "./pos-audit-outbox-service";
import { consumeApprovalToken } from "./pos-approval-service";
import {
  hashPosRequest,
  type PosPurchaseOrderCreateRequest,
  type PosPurchaseOrderReceiveRequest,
} from "./pos-contracts";
import { PosApiError } from "./pos-errors";
import { runIdempotent, type IdempotencyCompletion, type IdempotencyInput } from "./pos-idempotency-service";
import type { PosOperatorContext } from "./pos-operator-session-service";

export interface PosPurchaseOrderRecord {
  id: string;
  number: string;
  supplier: string;
  storeId: string;
  locationId: string | null;
  status: string;
  createdBy: string;
  receivedBy: string | null;
  idempotencyKey: string;
  createdAt: Date;
  receivedAt: Date | null;
}

export interface PosPurchaseOrderItemRecord {
  id: string;
  purchaseOrderId: string;
  productId: string;
  variantId: string | null;
  orderedQty: number;
  receivedQty: number;
  unitCost: string;
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
}

interface PosPurchaseInventoryRecord {
  id: string;
  stock: number;
}

export interface PosPurchaseDependencies {
  transaction<T>(work: (tx: DbTx) => Promise<T>): Promise<T>;
  runIdempotent<T>(input: IdempotencyInput, work: () => Promise<T>, completion?: IdempotencyCompletion<T>): Promise<T>;
  getStoreLocation(storeId: string, tx?: DbTx): Promise<{ storeId: string; warehouseId: string | null; active: boolean } | null>;
  validateProductVariant(productId: string, variantId: string | null, tx: DbTx): Promise<{
    productTitle: string; variantTitle: string | null; sku: string | null;
  } | null>;
  listOrders(storeId: string): Promise<Array<{ order: PosPurchaseOrderRecord; items: PosPurchaseOrderItemRecord[] }>>;
  insertOrder(order: PosPurchaseOrderRecord, tx: DbTx): Promise<void>;
  insertItems(items: PosPurchaseOrderItemRecord[], tx: DbTx): Promise<void>;
  lockOrder(id: string, tx: DbTx): Promise<PosPurchaseOrderRecord | null>;
  lockItems(orderId: string, tx: DbTx): Promise<PosPurchaseOrderItemRecord[]>;
  lockInventory(target: {
    productId: string; variantId: string | null; storeId: string; warehouseId: string | null;
  }, tx: DbTx): Promise<PosPurchaseInventoryRecord | null>;
  insertInventory(input: {
    id: string; productId: string; variantId: string | null; storeId: string; warehouseId: string | null; stock: number;
  }, tx: DbTx): Promise<boolean>;
  updateInventory(id: string, stock: number, tx: DbTx): Promise<void>;
  insertInventoryTransaction(input: {
    id: string; productId: string; variantId: string | null; quantity: number;
    beforeStock: number; afterStock: number; operatorId: string; referenceType: string; referenceId: string;
  }, tx: DbTx): Promise<void>;
  markItemsReceived(orderId: string, tx: DbTx): Promise<void>;
  markOrderReceived(orderId: string, receivedBy: string, receivedAt: Date, tx: DbTx): Promise<void>;
  consumeApprovalToken(token: string, operation: string, resourceHash: string, storeId: string, tx: DbTx): Promise<string>;
  enqueueAuditEvent: EnqueuePosAuditEvent;
  newId(): string;
  newNumber(now: Date): string;
  now(): Date;
}

function toOrder(row: typeof posPurchaseOrders.$inferSelect): PosPurchaseOrderRecord {
  return {
    id: row.id,
    number: row.number,
    supplier: row.supplier,
    storeId: row.store_id,
    locationId: row.location_id,
    status: row.status,
    createdBy: row.created_by,
    receivedBy: row.received_by,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    receivedAt: row.received_at,
  };
}

type PurchaseItemDisplayRow = typeof posPurchaseOrderItems.$inferSelect & {
  productTitle?: string | null;
  variantTitle?: string | null;
  sku?: string | null;
};

function toItem(row: PurchaseItemDisplayRow): PosPurchaseOrderItemRecord {
  return {
    id: row.id,
    purchaseOrderId: row.purchase_order_id,
    productId: row.product_id,
    variantId: row.variant_id,
    orderedQty: row.ordered_qty,
    receivedQty: row.received_qty,
    unitCost: row.unit_cost,
    productTitle: row.productTitle ?? '',
    variantTitle: row.variantTitle ?? null,
    sku: row.sku ?? null,
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  return candidate.code === "ER_DUP_ENTRY" || candidate.errno === 1062
    || candidate.cause?.code === "ER_DUP_ENTRY" || candidate.cause?.errno === 1062;
}

const purchaseItemSelect = {
  id: posPurchaseOrderItems.id,
  purchase_order_id: posPurchaseOrderItems.purchase_order_id,
  product_id: posPurchaseOrderItems.product_id,
  variant_id: posPurchaseOrderItems.variant_id,
  ordered_qty: posPurchaseOrderItems.ordered_qty,
  received_qty: posPurchaseOrderItems.received_qty,
  unit_cost: posPurchaseOrderItems.unit_cost,
  productTitle: products.title,
  variantTitle: productVariants.title,
  sku: sql<string | null>`COALESCE(${productVariants.sku}, ${products.barcode})`,
};

function inventoryCondition(target: {
  productId: string; variantId: string | null; storeId: string; warehouseId: string | null;
}) {
  return and(
    eq(inventory.product_id, target.productId),
    target.variantId === null ? isNull(inventory.variant_id) : eq(inventory.variant_id, target.variantId),
    eq(inventory.store_id, target.storeId),
    target.warehouseId === null ? isNull(inventory.warehouse_id) : eq(inventory.warehouse_id, target.warehouseId),
  );
}

const databasePurchaseDependencies: PosPurchaseDependencies = {
  transaction: (work) => db.transaction(work),
  runIdempotent,
  consumeApprovalToken,
  async getStoreLocation(storeId, tx) {
    const query = (tx ?? db).select({ id: stores.id, warehouseId: stores.warehouse_id, status: stores.status })
      .from(stores).where(eq(stores.id, storeId));
    const [row] = tx ? await query.for("update").limit(1) : await query.limit(1);
    return row ? { storeId: row.id, warehouseId: row.warehouseId, active: row.status === "active" } : null;
  },
  async validateProductVariant(productId, variantId, tx) {
    const [product] = await tx.select({ title: products.title, sku: products.barcode })
      .from(products).where(eq(products.id, productId)).limit(1);
    if (!product) return null;
    if (variantId === null) return { productTitle: product.title, variantTitle: null, sku: product.sku ?? null };
    const [variant] = await tx.select({ title: productVariants.title, sku: productVariants.sku })
      .from(productVariants).where(and(
        eq(productVariants.id, variantId),
        eq(productVariants.product_id, productId),
      )).limit(1);
    return variant ? {
      productTitle: product.title,
      variantTitle: variant.title ?? null,
      sku: variant.sku ?? product.sku ?? null,
    } : null;
  },
  async listOrders(storeId) {
    const orders = await db.select().from(posPurchaseOrders)
      .where(eq(posPurchaseOrders.store_id, storeId)).orderBy(desc(posPurchaseOrders.created_at));
    if (orders.length === 0) return [];
    const rows = await db.select(purchaseItemSelect).from(posPurchaseOrderItems)
      .innerJoin(products, eq(posPurchaseOrderItems.product_id, products.id))
      .leftJoin(productVariants, and(
        eq(posPurchaseOrderItems.variant_id, productVariants.id),
        eq(posPurchaseOrderItems.product_id, productVariants.product_id),
      ))
      .where(inArray(posPurchaseOrderItems.purchase_order_id, orders.map((order) => order.id)));
    const byOrder = new Map<string, PosPurchaseOrderItemRecord[]>();
    for (const row of rows) {
      const list = byOrder.get(row.purchase_order_id) ?? [];
      list.push(toItem(row));
      byOrder.set(row.purchase_order_id, list);
    }
    return orders.map((order) => ({ order: toOrder(order), items: byOrder.get(order.id) ?? [] }));
  },
  async insertOrder(order, tx) {
    await tx.insert(posPurchaseOrders).values({
      id: order.id,
      number: order.number,
      supplier: order.supplier,
      store_id: order.storeId,
      location_id: order.locationId,
      status: order.status,
      created_by: order.createdBy,
      received_by: order.receivedBy,
      idempotency_key: order.idempotencyKey,
      created_at: order.createdAt,
      received_at: order.receivedAt,
    });
  },
  async insertItems(items, tx) {
    await tx.insert(posPurchaseOrderItems).values(items.map((item) => ({
      id: item.id,
      purchase_order_id: item.purchaseOrderId,
      product_id: item.productId,
      variant_id: item.variantId,
      ordered_qty: item.orderedQty,
      received_qty: item.receivedQty,
      unit_cost: item.unitCost,
    })));
  },
  async lockOrder(id, tx) {
    const [row] = await tx.select().from(posPurchaseOrders)
      .where(eq(posPurchaseOrders.id, id)).for("update").limit(1);
    return row ? toOrder(row) : null;
  },
  async lockItems(orderId, tx) {
    const rows = await tx.select(purchaseItemSelect).from(posPurchaseOrderItems)
      .innerJoin(products, eq(posPurchaseOrderItems.product_id, products.id))
      .leftJoin(productVariants, and(
        eq(posPurchaseOrderItems.variant_id, productVariants.id),
        eq(posPurchaseOrderItems.product_id, productVariants.product_id),
      ))
      .where(eq(posPurchaseOrderItems.purchase_order_id, orderId)).for("update");
    return rows.map(toItem);
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
      type: "in",
      quantity: input.quantity,
      before_stock: input.beforeStock,
      after_stock: input.afterStock,
      note: "POS purchase order receipt",
      operator_id: input.operatorId,
      reference_type: input.referenceType,
      reference_id: input.referenceId,
    });
  },
  async markItemsReceived(orderId, tx) {
    await tx.update(posPurchaseOrderItems).set({ received_qty: sql`${posPurchaseOrderItems.ordered_qty}` })
      .where(eq(posPurchaseOrderItems.purchase_order_id, orderId));
  },
  async markOrderReceived(orderId, receivedBy, receivedAt, tx) {
    await tx.update(posPurchaseOrders).set({
      status: "received",
      received_by: receivedBy,
      received_at: receivedAt,
    }).where(and(eq(posPurchaseOrders.id, orderId), eq(posPurchaseOrders.status, "ordered")));
  },
  enqueueAuditEvent: enqueuePosAuditEvent,
  newId: randomUUID,
  newNumber(now) {
    const date = now.toISOString().slice(0, 10).replaceAll("-", "");
    return `PO-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
  },
  now: () => new Date(),
};

function requirePermission(operator: PosOperatorContext, permission: string): void {
  if (!operator.permissions.includes(permission)) {
    throw new PosApiError("POS_PERMISSION_REQUIRED", `POS permission ${permission} is required`, 403);
  }
}

function assertOperatorStore(storeId: string, operator: PosOperatorContext): void {
  if (storeId !== operator.storeId) {
    throw new PosApiError("OPERATOR_STORE_MISMATCH", "Operator session belongs to another store", 403);
  }
}

async function requireStoreLocation(
  storeId: string,
  locationId: string | null,
  dependencies: PosPurchaseDependencies,
  tx?: DbTx,
) {
  const store = await dependencies.getStoreLocation(storeId, tx);
  if (!store || !store.active) throw new PosApiError("STORE_UNAVAILABLE", "Store not found or inactive", 409);
  if (locationId !== null && locationId !== store.warehouseId) {
    throw new PosApiError("LOCATION_STORE_MISMATCH", "Location is not bound to the operator store", 403);
  }
  return store;
}

function orderDto(order: PosPurchaseOrderRecord, items: PosPurchaseOrderItemRecord[]) {
  return {
    id: order.id,
    number: order.number,
    supplier: order.supplier,
    store_id: order.storeId,
    location_id: order.locationId,
    status: order.status,
    created_by: order.createdBy,
    received_by: order.receivedBy,
    created_at: order.createdAt.toISOString(),
    received_at: order.receivedAt?.toISOString() ?? null,
    items: items.map((item) => ({
      id: item.id,
      product_id: item.productId,
      variant_id: item.variantId,
      ordered_qty: item.orderedQty,
      received_qty: item.receivedQty,
      unit_cost: item.unitCost,
      product_title: item.productTitle,
      variant_title: item.variantTitle,
      sku: item.sku,
    })),
  };
}

export async function listPosPurchaseOrders(
  input: { operator: PosOperatorContext },
  dependencies: PosPurchaseDependencies = databasePurchaseDependencies,
) {
  requirePermission(input.operator, "purchase_order_read");
  await requireStoreLocation(input.operator.storeId, null, dependencies);
  const rows = await dependencies.listOrders(input.operator.storeId);
  if (rows.some(({ order }) => order.storeId !== input.operator.storeId)) {
    throw new PosApiError("PURCHASE_ORDER_SCOPE_MISMATCH", "Purchase storage returned an out-of-scope order", 500);
  }
  return rows.map(({ order, items }) => orderDto(order, items));
}

export async function createPosPurchaseOrder(
  input: PosPurchaseOrderCreateRequest & { operator: PosOperatorContext },
  dependencies: PosPurchaseDependencies = databasePurchaseDependencies,
) {
  requirePermission(input.operator, "purchase_order_create");
  assertOperatorStore(input.store_id, input.operator);
  const requestHash = hashPosRequest({
    store_id: input.store_id,
    location_id: input.location_id,
    supplier: input.supplier,
    items: input.items,
  });
  return dependencies.runIdempotent({
    key: input.idempotency_key,
    operation: "purchase_create",
    storeId: input.store_id,
    requestHash,
  }, () => dependencies.transaction(async (tx) => {
    await requireStoreLocation(input.store_id, input.location_id, dependencies, tx);
    const createdAt = dependencies.now();
    const order: PosPurchaseOrderRecord = {
      id: dependencies.newId(),
      number: dependencies.newNumber(createdAt),
      supplier: input.supplier,
      storeId: input.store_id,
      locationId: input.location_id,
      status: "ordered",
      createdBy: input.operator.staffId,
      receivedBy: null,
      idempotencyKey: input.idempotency_key,
      createdAt,
      receivedAt: null,
    };
    const items: PosPurchaseOrderItemRecord[] = [];
    for (const item of input.items) {
      const product = await dependencies.validateProductVariant(item.product_id, item.variant_id, tx);
      if (!product) {
        throw new PosApiError("PRODUCT_VARIANT_MISMATCH", "Product does not exist or variant does not belong to product", 400);
      }
      items.push({
        id: dependencies.newId(),
        purchaseOrderId: order.id,
        productId: item.product_id,
        variantId: item.variant_id,
        orderedQty: item.ordered_qty,
        receivedQty: 0,
        unitCost: item.unit_cost,
        ...product,
      });
    }
    await dependencies.insertOrder(order, tx);
    await dependencies.insertItems(items, tx);
    const result = orderDto(order, items);
    await dependencies.enqueueAuditEvent(tx, {
      eventType: "pos.purchase_order.created",
      entityType: "purchase_order",
      entityId: order.id,
      storeId: order.storeId,
      operatorId: input.operator.staffId,
      payload: result,
    });
    return result;
  }), {
    responseStatus: 201,
    resourceType: "purchase_order",
    resourceId: (result) => result.id,
  });
}

export async function receivePosPurchaseOrder(
  input: PosPurchaseOrderReceiveRequest & { purchase_order_id: string; operator: PosOperatorContext },
  dependencies: PosPurchaseDependencies = databasePurchaseDependencies,
) {
  requirePermission(input.operator, "purchase_order_receive");
  assertOperatorStore(input.store_id, input.operator);
  if (!input.approval_token) throw new PosApiError("APPROVAL_REQUIRED", "A one-time approval token is required", 403);
  const requestHash = hashPosRequest({ purchase_order_id: input.purchase_order_id, store_id: input.store_id });
  return dependencies.runIdempotent({
    key: input.idempotency_key,
    operation: "receive",
    storeId: input.store_id,
    requestHash,
  }, () => dependencies.transaction(async (tx) => {
    const approvedBy = await dependencies.consumeApprovalToken(input.approval_token!, "receive", requestHash, input.store_id, tx);
    const order = await dependencies.lockOrder(input.purchase_order_id, tx);
    if (!order || order.storeId !== input.operator.storeId) {
      throw new PosApiError("PURCHASE_ORDER_NOT_FOUND", "Purchase order not found", 404);
    }
    if (order.status === "received") {
      throw new PosApiError("PURCHASE_ORDER_ALREADY_RECEIVED", "Purchase order is already received", 409);
    }
    if (order.status !== "ordered") {
      throw new PosApiError("PURCHASE_ORDER_NOT_RECEIVABLE", "Purchase order is not receivable", 409);
    }
    await requireStoreLocation(order.storeId, order.locationId, dependencies, tx);
    const items = await dependencies.lockItems(order.id, tx);
    if (items.length === 0) throw new PosApiError("PURCHASE_ORDER_EMPTY", "Purchase order has no items", 409);
    for (const item of items) {
      if (item.receivedQty !== 0) {
        throw new PosApiError("PARTIAL_RECEIPT_UNSUPPORTED", "Partial receipts are not supported", 409);
      }
      const product = await dependencies.validateProductVariant(item.productId, item.variantId, tx);
      if (!product) {
        throw new PosApiError("PRODUCT_VARIANT_MISMATCH", "Product does not exist or variant does not belong to product", 400);
      }
      const target = {
        productId: item.productId,
        variantId: item.variantId,
        storeId: order.storeId,
        warehouseId: order.locationId,
      };
      let inventoryRow = await dependencies.lockInventory(target, tx);
      if (!inventoryRow) {
        await dependencies.insertInventory({ id: dependencies.newId(), ...target, stock: 0 }, tx);
        inventoryRow = await dependencies.lockInventory(target, tx);
        if (!inventoryRow) {
          throw new PosApiError("INVENTORY_CREATE_CONFLICT", "Inventory row could not be selected after insert", 409, true);
        }
      }
      const afterStock = inventoryRow.stock + item.orderedQty;
      await dependencies.updateInventory(inventoryRow.id, afterStock, tx);
      await dependencies.insertInventoryTransaction({
        id: dependencies.newId(),
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.orderedQty,
        beforeStock: inventoryRow.stock,
        afterStock,
        operatorId: input.operator.staffId,
        referenceType: "purchase_order",
        referenceId: order.id,
      }, tx);
    }
    const receivedAt = dependencies.now();
    await dependencies.markItemsReceived(order.id, tx);
    await dependencies.markOrderReceived(order.id, input.operator.staffId, receivedAt, tx);
    const receivedOrder: PosPurchaseOrderRecord = {
      ...order,
      status: "received",
      receivedBy: input.operator.staffId,
      receivedAt,
    };
    const receivedItems = items.map((item) => ({ ...item, receivedQty: item.orderedQty }));
    const result = orderDto(receivedOrder, receivedItems);
    await dependencies.enqueueAuditEvent(tx, {
      eventType: "pos.purchase_order.received",
      entityType: "purchase_order",
      entityId: order.id,
      storeId: order.storeId,
      operatorId: input.operator.staffId,
      payload: { ...result, approved_by: approvedBy },
    });
    return result;
  }), {
    responseStatus: 200,
    resourceType: "purchase_order",
    resourceId: input.purchase_order_id,
  });
}
