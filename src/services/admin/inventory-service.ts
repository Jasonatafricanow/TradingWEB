import { db } from '@/lib/db';
import { and, eq, isNull, or } from 'drizzle-orm';
import {
  inventory,
  inventoryTransactions,
  productVariants,
  products,
  stores,
  warehouses,
} from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';
import type { DbTx } from '@/services/orders/order-pricing-service';
import type { PosOperatorContext } from './pos-operator-session-service';
import { PosApiError } from './pos-errors';
import { hashPosRequest, type PosInventoryAdjustmentRequest, type PosTransferCreateRequest } from './pos-contracts';
import { consumeApprovalToken } from './pos-approval-service';
import { enqueuePosAuditEvent, type EnqueuePosAuditEvent } from './pos-audit-outbox-service';
import { runIdempotent, type IdempotencyCompletion, type IdempotencyInput } from './pos-idempotency-service';
import { createTransfer, type CreateTransferParams, type TransferResult } from './transfer-service';

type SqlValue = string | number | null;
type InventoryRow = Record<string, unknown>;

export interface InventoryTarget {
  productId: string;
  variantId?: string | null;
  storeId?: string | null;
  warehouseId?: string | null;
}

export interface InventoryFilters {
  productId?: string;
  variantId?: string | null;
  storeId?: string | null;
  warehouseId?: string | null;
}

const INVENTORY_JOIN_SELECT = `
  SELECT
    i.*,
    p.title AS product_title,
    p.title_en AS product_title_en,
    p.type AS product_type,
    p.status AS product_status,
    v.title AS variant_title,
    v.sku AS variant_sku,
    v.barcode AS variant_barcode,
    s.name AS store_name,
    s.slug AS store_slug,
    s.type AS store_type,
    s.status AS store_status,
    w.name AS warehouse_name,
    w.location AS warehouse_location,
    w.type AS warehouse_type
  FROM inventory i
  LEFT JOIN products p ON i.product_id = p.id
  LEFT JOIN product_variants v ON i.variant_id = v.id
  LEFT JOIN stores s ON i.store_id = s.id
  LEFT JOIN warehouses w ON i.warehouse_id = w.id
`;

function normalizeTarget(target: string | InventoryTarget): Required<InventoryTarget> {
  if (typeof target === 'string') {
    return { productId: target, variantId: null, storeId: null, warehouseId: null };
  }
  return {
    productId: target.productId,
    variantId: target.variantId ?? null,
    storeId: target.storeId ?? null,
    warehouseId: target.warehouseId ?? null,
  };
}

function addNullableColumnMatch(where: string[], params: SqlValue[], column: string, value: string | null | undefined) {
  const normalized = value ?? null;
  where.push(`((${column} IS NULL AND ? IS NULL) OR ${column} = ?)`);
  params.push(normalized, normalized);
}

function buildInventoryWhere(filters: InventoryFilters) {
  const where: string[] = [];
  const params: SqlValue[] = [];
  if (filters.productId) {
    where.push('i.product_id = ?');
    params.push(filters.productId);
  }
  if (filters.variantId !== undefined) {
    addNullableColumnMatch(where, params, 'i.variant_id', filters.variantId);
  }
  if (filters.storeId !== undefined) {
    addNullableColumnMatch(where, params, 'i.store_id', filters.storeId);
  }
  if (filters.warehouseId !== undefined) {
    addNullableColumnMatch(where, params, 'i.warehouse_id', filters.warehouseId);
  }
  return {
    sql: where.length ? ` WHERE ${where.join(' AND ')}` : '',
    params,
  };
}

function toInventoryDto(row: InventoryRow) {
  const storeName = row.store_name ? String(row.store_name) : '';
  const warehouseName = row.warehouse_name ? String(row.warehouse_name) : '';
  return {
    ...row,
    products: row.product_title != null
      ? {
          id: row.product_id,
          title: row.product_title,
          title_en: row.product_title_en,
          type: row.product_type,
          status: row.product_status,
        }
      : null,
    variants: row.variant_id
      ? {
          id: row.variant_id,
          title: row.variant_title,
          sku: row.variant_sku,
          barcode: row.variant_barcode,
        }
      : null,
    stores: row.store_id
      ? {
          id: row.store_id,
          name: row.store_name,
          slug: row.store_slug,
          type: row.store_type,
          status: row.store_status,
        }
      : null,
    warehouses: row.warehouse_id
      ? {
          id: row.warehouse_id,
          name: row.warehouse_name,
          location: row.warehouse_location,
          type: row.warehouse_type,
        }
      : null,
    location_label: storeName || warehouseName || '未指定地点',
  };
}

async function getJoinedInventoryById(id: string) {
  const [rows] = await db.$client.execute(
    `${INVENTORY_JOIN_SELECT} WHERE i.id = ? LIMIT 1`,
    [id]
  );
  const row = (rows as InventoryRow[])[0];
  return row ? toInventoryDto(row) : null;
}

async function findInventoryRecord(target: Required<InventoryTarget>) {
  const where: string[] = ['product_id = ?'];
  const params: SqlValue[] = [target.productId];
  addNullableColumnMatch(where, params, 'variant_id', target.variantId);
  addNullableColumnMatch(where, params, 'store_id', target.storeId);
  addNullableColumnMatch(where, params, 'warehouse_id', target.warehouseId);

  const [rows] = await db.$client.execute(
    `SELECT * FROM inventory WHERE ${where.join(' AND ')} LIMIT 1`,
    params
  );
  return (rows as Array<typeof inventory.$inferSelect>)[0] || null;
}

async function findOrCreateInventoryRecord(target: Required<InventoryTarget>) {
  const existing = await findInventoryRecord(target);
  if (existing) return existing;

  const id = randomUUID();
  await db.insert(inventory).values({
    id,
    product_id: target.productId,
    variant_id: target.variantId,
    store_id: target.storeId,
    warehouse_id: target.warehouseId,
    stock: 0,
    low_stock_threshold: 10,
  } as typeof inventory.$inferInsert);

  const created = await findInventoryRecord(target);
  if (!created) throw new Error('Inventory record create failed');
  return created;
}

// 所有库存变动统一从这里写流水;reference_type/reference_id 用于关联订单、调拨等来源
export async function recordInventoryTransaction(input: {
  product_id: string;
  variant_id?: string | null;
  type: 'in' | 'out' | 'restock' | 'adjust';
  quantity: number;
  before_stock: number;
  after_stock: number;
  note?: string | null;
  operator_id?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
}) {
  try {
    await db.$client.execute(
      'INSERT INTO inventory_transactions (id, product_id, variant_id, type, quantity, before_stock, after_stock, note, operator_id, reference_type, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        randomUUID(),
        input.product_id,
        input.variant_id ?? null,
        input.type,
        input.quantity,
        input.before_stock,
        input.after_stock,
        input.note ?? null,
        input.operator_id ?? null,
        input.reference_type ?? null,
        input.reference_id ?? null,
      ]
    );
  } catch { /* transaction table may not exist */ }
}

export async function listInventory(filters: InventoryFilters = {}) {
  try {
    const where = buildInventoryWhere(filters);
    const [rows] = await db.$client.execute(
      `${INVENTORY_JOIN_SELECT}${where.sql} ORDER BY COALESCE(p.title, p.title_en, i.product_id) ASC, COALESCE(v.position, 0) ASC, COALESCE(s.name, w.name, '') ASC`,
      where.params
    );
    return { data: (rows as InventoryRow[]).map(toInventoryDto), error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function getInventoryByProduct(productId: string) {
  try {
    const data = await db.select().from(inventory).where(eq(inventory.product_id, productId));
    return { data: data || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function updateStock(inventoryId: string, stock: number, operatorId?: string) {
  if (stock < 0) throw new Error('库存不能为负数');
  const [current] = await db.select().from(inventory).where(eq(inventory.id, inventoryId)).limit(1);
  if (!current) throw new Error('Inventory record not found');
  await db.update(inventory).set({ stock, updated_at: new Date() }).where(eq(inventory.id, inventoryId));
  if (stock !== current.stock) {
    await recordInventoryTransaction({
      product_id: current.product_id,
      variant_id: current.variant_id,
      type: 'adjust',
      quantity: Math.abs(stock - current.stock),
      before_stock: current.stock,
      after_stock: stock,
      note: 'manual set',
      operator_id: operatorId ?? null,
    });
  }
  return getJoinedInventoryById(inventoryId);
}

export async function adjustStock(
  target: string | InventoryTarget,
  targetStock: number,
  reason?: string,
  operatorId?: string
) {
  if (!Number.isInteger(targetStock) || targetStock < 0) throw new Error('目标库存必须是非负整数');
  const normalized = normalizeTarget(target);
  const current = await findOrCreateInventoryRecord(normalized);

  await db.update(inventory)
    .set({ stock: targetStock, updated_at: new Date() })
    .where(eq(inventory.id, current.id));

  await recordInventoryTransaction({
    product_id: current.product_id,
    variant_id: current.variant_id,
    type: 'adjust',
    quantity: Math.abs(targetStock - current.stock),
    before_stock: current.stock,
    after_stock: targetStock,
    note: reason || 'manual set',
    operator_id: operatorId ?? null,
  });

  return getJoinedInventoryById(current.id);
}

export async function getStockTransactions(productId?: string, limit = 100, variantId?: string | null) {
  try {
    const where: string[] = [];
    const params: SqlValue[] = [];
    if (productId) {
      where.push('tx.product_id = ?');
      params.push(productId);
    }
    if (variantId !== undefined) {
      addNullableColumnMatch(where, params, 'tx.variant_id', variantId);
    }
    const [rows] = await db.$client.execute(
      `SELECT
        tx.*,
        p.title AS product_title,
        v.title AS variant_title,
        v.sku AS variant_sku,
        v.barcode AS variant_barcode
      FROM inventory_transactions tx
      LEFT JOIN products p ON tx.product_id = p.id
      LEFT JOIN product_variants v ON tx.variant_id = v.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY tx.created_at DESC LIMIT ?`,
      [...params, String(limit)]
    );
    return { data: rows || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function setLowStockThreshold(inventoryId: string, threshold: number) {
  await db.update(inventory).set({ low_stock_threshold: threshold }).where(eq(inventory.id, inventoryId));
  return getJoinedInventoryById(inventoryId);
}

export async function getLowStockItems() {
  try {
    const [rows] = await db.$client.execute(
      `${INVENTORY_JOIN_SELECT} WHERE i.stock <= i.low_stock_threshold AND i.stock > 0 ORDER BY i.stock ASC`
    );
    return { data: (rows as InventoryRow[]).map(toInventoryDto), error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function getOutOfStockItems() {
  try {
    const [rows] = await db.$client.execute(
      `${INVENTORY_JOIN_SELECT} WHERE i.stock <= 0 ORDER BY COALESCE(p.title, p.title_en, i.product_id) ASC`
    );
    return { data: (rows as InventoryRow[]).map(toInventoryDto), error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function bulkUpdateStock(updates: { inventoryId: string; stock: number }[], operatorId?: string) {
  try {
    for (const u of updates) {
      await updateStock(u.inventoryId, u.stock, operatorId);
    }
    return { updated: updates.length };
  } catch (error) {
    throw error;
  }
}

export async function stockIn(
  target: string | InventoryTarget,
  quantity: number,
  note?: string,
  operatorId?: string
) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('数量必须大于 0');
  const normalized = normalizeTarget(target);
  const rec = await findOrCreateInventoryRecord(normalized);

  await db.$client.execute(
    'UPDATE inventory SET stock = stock + ?, updated_at = NOW() WHERE id = ?',
    [quantity, rec.id]
  );
  const [rows] = await db.$client.execute('SELECT stock FROM inventory WHERE id = ? LIMIT 1', [rec.id]);
  const afterStock = Number((rows as Array<{ stock: number }>)[0]?.stock ?? rec.stock + quantity);

  await recordInventoryTransaction({
    product_id: rec.product_id,
    variant_id: rec.variant_id,
    type: 'in',
    quantity,
    before_stock: afterStock - quantity,
    after_stock: afterStock,
    note: note ?? null,
    operator_id: operatorId ?? null,
  });

  return getJoinedInventoryById(rec.id);
}

export async function stockOut(
  target: string | InventoryTarget,
  quantity: number,
  note?: string,
  operatorId?: string
) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('数量必须大于 0');
  const normalized = normalizeTarget(target);
  const rec = await findInventoryRecord(normalized);
  if (!rec) throw new Error('库存不足');

  const [res] = await db.$client.execute(
    'UPDATE inventory SET stock = stock - ?, updated_at = NOW() WHERE id = ? AND stock >= ?',
    [quantity, rec.id, quantity]
  );
  if (((res as { affectedRows?: number }).affectedRows ?? 0) === 0) {
    throw new Error('库存不足');
  }

  const [rows] = await db.$client.execute('SELECT stock FROM inventory WHERE id = ? LIMIT 1', [rec.id]);
  const afterStock = Number((rows as Array<{ stock: number }>)[0]?.stock ?? rec.stock - quantity);

  await recordInventoryTransaction({
    product_id: rec.product_id,
    variant_id: rec.variant_id,
    type: 'out',
    quantity,
    before_stock: afterStock + quantity,
    after_stock: afterStock,
    note: note ?? null,
    operator_id: operatorId ?? null,
  });

  return getJoinedInventoryById(rec.id);
}

export async function listTransactions(productId?: string, variantId?: string | null) {
  return getStockTransactions(productId, 100, variantId);
}

// ==================== authenticated POS inventory boundary ====================

export interface PosInventoryRecord {
  id: string;
  productId: string;
  variantId: string | null;
  storeId: string;
  warehouseId: string | null;
  stock: number;
  lowStockThreshold: number;
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
}

export interface PosStoreLocation {
  storeId: string;
  warehouseId: string | null;
  active: boolean;
}

export interface PosInventoryDependencies {
  transaction<T>(work: (tx: DbTx) => Promise<T>): Promise<T>;
  runIdempotent<T>(input: IdempotencyInput, work: () => Promise<T>, completion?: IdempotencyCompletion<T>): Promise<T>;
  getStoreLocation(storeId: string, tx?: DbTx): Promise<PosStoreLocation | null>;
  listInventory(storeId: string, warehouseId: string | null): Promise<PosInventoryRecord[]>;
  listLocations(): Promise<Array<{ id: string; name: string; type: string; active: boolean }>>;
  locationExists(locationId: string): Promise<boolean>;
  validateProductVariant(productId: string, variantId: string | null, tx: DbTx): Promise<{
    productTitle: string; variantTitle: string | null; sku: string | null;
  } | null>;
  lockInventory(target: {
    productId: string; variantId: string | null; storeId: string; warehouseId: string | null;
  }, tx: DbTx): Promise<PosInventoryRecord | null>;
  insertInventory(record: PosInventoryRecord, tx: DbTx): Promise<boolean>;
  updateInventory(id: string, stock: number, tx: DbTx): Promise<void>;
  insertInventoryTransaction(input: {
    id: string; productId: string; variantId: string | null; quantity: number;
    beforeStock: number; afterStock: number; note: string | null; operatorId: string;
    referenceType: string; referenceId: string;
  }, tx: DbTx): Promise<void>;
  consumeApprovalToken(token: string, operation: string, resourceHash: string, storeId: string, tx: DbTx): Promise<string>;
  enqueueAuditEvent: EnqueuePosAuditEvent;
  createTransfer(input: CreateTransferParams): Promise<TransferResult>;
  newId(): string;
}

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

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  return candidate.code === 'ER_DUP_ENTRY' || candidate.errno === 1062
    || candidate.cause?.code === 'ER_DUP_ENTRY' || candidate.cause?.errno === 1062;
}

const databasePosInventoryDependencies: PosInventoryDependencies = {
  transaction: (work) => db.transaction(work),
  runIdempotent,
  async getStoreLocation(storeId, tx) {
    const query = (tx ?? db).select({
      storeId: stores.id,
      warehouseId: stores.warehouse_id,
      status: stores.status,
    }).from(stores).where(eq(stores.id, storeId));
    const [row] = tx ? await query.for('update').limit(1) : await query.limit(1);
    return row ? { storeId: row.storeId, warehouseId: row.warehouseId, active: row.status === 'active' } : null;
  },
  async listInventory(storeId, warehouseId) {
    const locationCondition = warehouseId === null
      ? isNull(inventory.warehouse_id)
      : or(isNull(inventory.warehouse_id), eq(inventory.warehouse_id, warehouseId));
    const rows = await db.select({
      id: inventory.id,
      productId: inventory.product_id,
      variantId: inventory.variant_id,
      storeId: inventory.store_id,
      warehouseId: inventory.warehouse_id,
      stock: inventory.stock,
      lowStockThreshold: inventory.low_stock_threshold,
      productTitle: products.title,
      variantTitle: productVariants.title,
      sku: productVariants.sku,
    }).from(inventory)
      .innerJoin(products, eq(inventory.product_id, products.id))
      .leftJoin(productVariants, eq(inventory.variant_id, productVariants.id))
      .where(and(eq(inventory.store_id, storeId), locationCondition));
    return rows.map((row) => ({
      ...row,
      storeId: row.storeId ?? storeId,
      productTitle: row.productTitle,
      variantTitle: row.variantTitle ?? null,
      sku: row.sku ?? null,
    }));
  },
  async listLocations() {
    const rows = await db.select({ id: warehouses.id, name: warehouses.name, type: warehouses.type, active: warehouses.is_active })
      .from(warehouses).where(eq(warehouses.is_active, true));
    return rows;
  },
  async locationExists(locationId) {
    const [row] = await db.select({ id: warehouses.id }).from(warehouses)
      .where(and(eq(warehouses.id, locationId), eq(warehouses.is_active, true))).limit(1);
    return Boolean(row);
  },
  async validateProductVariant(productId, variantId, tx) {
    const [product] = await tx.select({ title: products.title, sku: products.barcode })
      .from(products).where(eq(products.id, productId)).limit(1);
    if (!product) return null;
    if (variantId === null) {
      return { productTitle: product.title, variantTitle: null, sku: product.sku ?? null };
    }
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
  async lockInventory(target, tx) {
    const [row] = await tx.select({
      id: inventory.id,
      productId: inventory.product_id,
      variantId: inventory.variant_id,
      storeId: inventory.store_id,
      warehouseId: inventory.warehouse_id,
      stock: inventory.stock,
      lowStockThreshold: inventory.low_stock_threshold,
    }).from(inventory).where(inventoryCondition(target)).for('update').limit(1);
    return row ? {
      ...row,
      storeId: row.storeId ?? target.storeId,
      productTitle: '',
      variantTitle: null,
      sku: null,
    } : null;
  },
  async insertInventory(record, tx) {
    try {
      await tx.insert(inventory).values({
        id: record.id,
        product_id: record.productId,
        variant_id: record.variantId,
        store_id: record.storeId,
        warehouse_id: record.warehouseId,
        stock: record.stock,
        low_stock_threshold: record.lowStockThreshold,
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
      type: 'adjust',
      quantity: Math.abs(input.quantity),
      before_stock: input.beforeStock,
      after_stock: input.afterStock,
      note: input.note,
      operator_id: input.operatorId,
      reference_type: input.referenceType,
      reference_id: input.referenceId,
    });
  },
  consumeApprovalToken,
  enqueueAuditEvent: enqueuePosAuditEvent,
  createTransfer,
  newId: randomUUID,
};

function requirePermission(operator: PosOperatorContext, permission: string): void {
  if (!operator.permissions.includes(permission)) {
    throw new PosApiError('POS_PERMISSION_REQUIRED', `POS permission ${permission} is required`, 403);
  }
}

function assertOperatorStore(requestStoreId: string, operator: PosOperatorContext): void {
  if (requestStoreId !== operator.storeId) {
    throw new PosApiError('OPERATOR_STORE_MISMATCH', 'Operator session belongs to another store', 403);
  }
}

async function requireStoreLocation(
  storeId: string,
  requestedLocationId: string | null,
  dependencies: PosInventoryDependencies,
  tx?: DbTx,
): Promise<PosStoreLocation> {
  const store = await dependencies.getStoreLocation(storeId, tx);
  if (!store || !store.active) throw new PosApiError('STORE_UNAVAILABLE', 'Store not found or inactive', 409);
  if (requestedLocationId !== null && requestedLocationId !== store.warehouseId) {
    throw new PosApiError('LOCATION_STORE_MISMATCH', 'Location is not bound to the operator store', 403);
  }
  return store;
}

function inventoryDto(row: PosInventoryRecord, locationName: string | null = null) {
  return {
    id: row.id,
    product_id: row.productId,
    variant_id: row.variantId,
    store_id: row.storeId,
    location_id: row.warehouseId,
    location_name: locationName,
    stock: row.stock,
    low_stock_threshold: row.lowStockThreshold,
    product_title: row.productTitle,
    variant_title: row.variantTitle,
    sku: row.sku,
  };
}

export async function listPosInventory(
  input: { operator: PosOperatorContext },
  dependencies: PosInventoryDependencies = databasePosInventoryDependencies,
) {
  requirePermission(input.operator, 'inventory_read');
  const store = await requireStoreLocation(input.operator.storeId, null, dependencies);
  const [rows, locations] = await Promise.all([
    dependencies.listInventory(input.operator.storeId, store.warehouseId),
    dependencies.listLocations(),
  ]);
  const locationNames = new Map(locations.map((location) => [location.id, location.name]));
  for (const row of rows) {
    if (row.storeId !== input.operator.storeId || (row.warehouseId !== null && row.warehouseId !== store.warehouseId)) {
      throw new PosApiError('INVENTORY_SCOPE_MISMATCH', 'Inventory storage returned an out-of-scope row', 500);
    }
  }
  return rows.map((row) => inventoryDto(row, row.warehouseId ? locationNames.get(row.warehouseId) ?? null : null));
}

export async function listPosInventoryLocations(
  input: { operator: PosOperatorContext; purpose?: 'inventory' | 'inventory_adjustment' | 'inventory_transfer' | 'purchase_order' },
  dependencies: PosInventoryDependencies = databasePosInventoryDependencies,
) {
  const purpose = input.purpose ?? 'inventory';
  const permitted = purpose === 'inventory_transfer'
    ? input.operator.permissions.includes('inventory_transfer')
    : purpose === 'inventory_adjustment'
      ? input.operator.permissions.includes('inventory_adjust')
      : purpose === 'purchase_order'
        ? input.operator.permissions.some((permission) => permission.startsWith('purchase_order_'))
        : input.operator.permissions.includes('inventory_read');
  if (!permitted) throw new PosApiError('POS_PERMISSION_REQUIRED', `POS permission for ${purpose} is required`, 403);
  const store = await requireStoreLocation(input.operator.storeId, null, dependencies);
  const locations = await dependencies.listLocations();
  const visible = purpose === 'inventory_transfer'
    ? locations
    : locations.filter((location) => location.id === store.warehouseId);
  return visible.map((location) => ({
    id: location.id,
    name: location.name,
    type: location.type,
    is_active: location.active,
    is_store_default: location.id === store.warehouseId,
  }));
}

export async function adjustPosInventory(
  input: PosInventoryAdjustmentRequest & { operator: PosOperatorContext },
  dependencies: PosInventoryDependencies = databasePosInventoryDependencies,
) {
  requirePermission(input.operator, 'inventory_adjust');
  assertOperatorStore(input.store_id, input.operator);
  if (!input.approval_token) throw new PosApiError('APPROVAL_REQUIRED', 'A one-time approval token is required', 403);
  const approvedResource = {
    idempotency_key: input.idempotency_key,
    store_id: input.store_id,
    product_id: input.product_id,
    variant_id: input.variant_id,
    location_id: input.location_id,
    delta: input.delta,
    reason: input.reason,
    note: input.note,
  };
  const resourceHash = hashPosRequest(approvedResource);
  return dependencies.runIdempotent({
    key: input.idempotency_key,
    operation: 'stock_adjust',
    storeId: input.store_id,
    requestHash: resourceHash,
  }, () => dependencies.transaction(async (tx) => {
    await requireStoreLocation(input.store_id, input.location_id, dependencies, tx);
    const product = await dependencies.validateProductVariant(input.product_id, input.variant_id, tx);
    if (!product) {
      throw new PosApiError('PRODUCT_VARIANT_MISMATCH', 'Product does not exist or variant does not belong to product', 400);
    }
    const approvedBy = await dependencies.consumeApprovalToken(
      input.approval_token!, 'inventory_adjustment', resourceHash, input.store_id, tx,
    );
    const target = {
      productId: input.product_id,
      variantId: input.variant_id,
      storeId: input.store_id,
      warehouseId: input.location_id,
    };
    let row = await dependencies.lockInventory(target, tx);
    if (!row) {
      const candidate: PosInventoryRecord = {
        id: dependencies.newId(),
        ...target,
        stock: 0,
        lowStockThreshold: 10,
        productTitle: product.productTitle,
        variantTitle: product.variantTitle,
        sku: product.sku,
      };
      await dependencies.insertInventory(candidate, tx);
      row = await dependencies.lockInventory(target, tx);
      if (!row) throw new PosApiError('INVENTORY_CREATE_CONFLICT', 'Inventory row could not be selected after insert', 409, true);
    }
    const afterStock = row.stock + input.delta;
    if (afterStock < 0) {
      throw new PosApiError('INSUFFICIENT_INVENTORY', 'Inventory adjustment would make stock negative', 409);
    }
    const adjustmentId = dependencies.newId();
    await dependencies.updateInventory(row.id, afterStock, tx);
    await dependencies.insertInventoryTransaction({
      id: dependencies.newId(),
      productId: row.productId,
      variantId: row.variantId,
      quantity: input.delta,
      beforeStock: row.stock,
      afterStock,
      note: input.note,
      operatorId: input.operator.staffId,
      referenceType: 'pos_adjustment',
      referenceId: adjustmentId,
    }, tx);
    const result = {
      id: adjustmentId,
      inventory_id: row.id,
      store_id: row.storeId,
      location_id: row.warehouseId,
      product_id: row.productId,
      variant_id: row.variantId,
      delta: input.delta,
      reason: input.reason,
      note: input.note,
      before_stock: row.stock,
      after_stock: afterStock,
      approved_by: approvedBy,
      operator_id: input.operator.staffId,
    };
    await dependencies.enqueueAuditEvent(tx, {
      eventType: 'pos.inventory.adjusted',
      entityType: 'inventory_adjustment',
      entityId: adjustmentId,
      storeId: input.store_id,
      operatorId: input.operator.staffId,
      payload: result,
    });
    return result;
  }), {
    responseStatus: 201,
    resourceType: 'inventory_adjustment',
    resourceId: (result) => result.id,
  });
}

export async function createPosInventoryTransfer(
  input: PosTransferCreateRequest & { operator: PosOperatorContext },
  dependencies: PosInventoryDependencies = databasePosInventoryDependencies,
) {
  requirePermission(input.operator, 'inventory_transfer');
  assertOperatorStore(input.store_id, input.operator);
  const store = await requireStoreLocation(input.store_id, input.from_location_id, dependencies);
  if (!store.warehouseId) throw new PosApiError('STORE_LOCATION_REQUIRED', 'Store has no transfer location', 409);
  if (!await dependencies.locationExists(input.to_location_id)) {
    throw new PosApiError('TRANSFER_DESTINATION_NOT_FOUND', 'Destination location is unavailable', 404);
  }
  const requestHash = hashPosRequest({
    store_id: input.store_id,
    from_location_id: input.from_location_id,
    to_location_id: input.to_location_id,
    note: input.note,
    items: input.items,
  });
  return dependencies.runIdempotent({
    key: input.idempotency_key,
    operation: 'inventory_transfer',
    storeId: input.store_id,
    requestHash,
  }, async () => {
    const transfer = await dependencies.createTransfer({
      storeId: input.store_id,
      fromWarehouseId: input.from_location_id,
      toWarehouseId: input.to_location_id,
      note: input.note ?? undefined,
      operatorId: input.operator.staffId,
      items: input.items.map((item) => ({
        productId: item.product_id,
        variantId: item.variant_id ?? undefined,
        quantity: item.quantity,
      })),
    });
    const expectedItems = input.items.map((item) => ({
      productId: item.product_id,
      variantId: item.variant_id,
      quantity: item.quantity,
    }));
    if (
      transfer.status !== 'pending'
      || transfer.storeId !== input.store_id
      || transfer.fromLocationId !== input.from_location_id
      || transfer.toLocationId !== input.to_location_id
      || transfer.operatorId !== input.operator.staffId
      || JSON.stringify(transfer.items) !== JSON.stringify(expectedItems)
    ) {
      throw new PosApiError('TRANSFER_ACK_INVALID', 'Transfer service returned mismatched immutable facts', 502, true);
    }
    return {
      id: transfer.id,
      reference_no: transfer.referenceNo,
      status: transfer.status,
      store_id: transfer.storeId,
      from_location_id: transfer.fromLocationId,
      to_location_id: transfer.toLocationId,
      operator_id: transfer.operatorId,
      items: transfer.items.map((item) => ({
        product_id: item.productId,
        variant_id: item.variantId,
        quantity: item.quantity,
      })),
    };
  }, {
    responseStatus: 201,
    resourceType: 'stock_transfer',
    resourceId: (result) => result.id,
  });
}
