import { db } from '@/lib/db';
import { eq, asc, and, sql } from 'drizzle-orm';
import { warehouses, inventory } from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';
import { recordInventoryTransaction } from './inventory-service';

export async function listWarehouses() {
  try {
    const data = await db.select().from(warehouses).orderBy(asc(warehouses.name));
    return { data: data || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function createWarehouse(input: { name: string; location?: string; type?: string }) {
  try {
    const id = randomUUID();
    // 使用 raw SQL 避免 schema 中 `type` 列与实际数据库不匹配
    await db.$client.execute(
      'INSERT INTO warehouses (id, name, location, is_active, created_at) VALUES (?, ?, ?, default, default)',
      [id, input.name, input.location || null]
    );
    const [data] = await db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1);
    return data;
  } catch (error) {
    throw error;
  }
}

export async function updateWarehouse(id: string, input: { name?: string; location?: string; is_active?: boolean; type?: string }) {
  try {
    // 使用 raw SQL 避免 schema 列与实际数据库不匹配
    const sets: string[] = [];
    const values: any[] = [];
    if (input.name !== undefined) { sets.push('name = ?'); values.push(input.name); }
    if (input.location !== undefined) { sets.push('location = ?'); values.push(input.location); }
    if (input.is_active !== undefined) { sets.push('is_active = ?'); values.push(input.is_active); }
    if (sets.length > 0) {
      values.push(id);
      await db.$client.execute(
        `UPDATE warehouses SET ${sets.join(', ')} WHERE id = ?`,
        values
      );
    }
    const [data] = await db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1);
    return data;
  } catch (error) {
    throw error;
  }
}

export async function restock(params: { 
  supplierId: string; 
  productId: string; 
  quantity: number; 
  note?: string; 
  operatorId?: string 
}) {
  try {
    // Verify source is a supplier
    const [supplier] = await db.select().from(warehouses).where(
      and(eq(warehouses.id, params.supplierId), eq(warehouses.type, "supplier"))
    ).limit(1);
    if (!supplier) throw new Error("Supplier not found or not a supplier type");

    // Get or create inventory record for the product
    const [invRec] = await db.select().from(inventory).where(
      eq(inventory.product_id, params.productId)
    ).limit(1);
    
    if (invRec) {
      await db.update(inventory).set({ stock: sql`stock + ${params.quantity}` }).where(eq(inventory.id, invRec.id));
    } else {
      const newId = randomUUID();
      await db.insert(inventory).values({
        id: newId,
        product_id: params.productId,
        stock: params.quantity,
        low_stock_threshold: 0,
      });
    }
    
    // Record transaction
    const [after] = await db.select({ stock: inventory.stock }).from(inventory).where(
      eq(inventory.product_id, params.productId)
    ).limit(1);
    const afterStock = after ? after.stock : params.quantity;
    await recordInventoryTransaction({
      product_id: params.productId,
      type: 'restock',
      quantity: params.quantity,
      before_stock: Math.max(0, afterStock - params.quantity),
      after_stock: afterStock,
      note: params.note || `Restock from ${params.supplierId}`,
      operator_id: params.operatorId ?? null,
      reference_type: 'supplier',
      reference_id: params.supplierId,
    });
    
    return { success: true, stock: invRec ? undefined : params.quantity };
  } catch (error) {
    throw error;
  }
}
