import { db } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { stores, warehouses } from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';

type StoreJoinRow = {
  stores: typeof stores.$inferSelect;
  warehouses: typeof warehouses.$inferSelect | null;
};

// 页面按扁平 store 字段读取,仓库信息挂在 warehouses.name 上
function flattenStoreRow(row: StoreJoinRow) {
  return {
    ...row.stores,
    warehouses: row.warehouses ? { name: row.warehouses.name } : undefined,
  };
}

export async function listStores() {
  try {
    const rows = await db
      .select()
      .from(stores)
      .leftJoin(warehouses, eq(stores.warehouse_id, warehouses.id))
      .orderBy(desc(stores.created_at));
    return { data: rows.map(flattenStoreRow), error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function getStore(id: string) {
  try {
    const [row] = await db
      .select()
      .from(stores)
      .leftJoin(warehouses, eq(stores.warehouse_id, warehouses.id))
      .where(eq(stores.id, id))
      .limit(1);
    return { data: row ? flattenStoreRow(row) : null, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export async function createStore(input: {
  name: string; slug?: string; type?: string; status?: string;
  warehouse_id?: string; contact_name?: string; contact_phone?: string;
  address_line1?: string; address_line2?: string; city?: string; state?: string;
  zip?: string; country?: string; open_time?: string; close_time?: string;
  open_at?: string; close_at?: string; metadata?: Record<string, unknown>;
}) {
  try {
    const id = randomUUID();
    await db.insert(stores).values({
      id,
      name: input.name,
      slug: input.slug || null,
      type: input.type || 'permanent',
      status: input.status || 'active',
      warehouse_id: input.warehouse_id || null,
      contact_name: input.contact_name || null,
      contact_phone: input.contact_phone || null,
      address_line1: input.address_line1 || null,
      address_line2: input.address_line2 || null,
      city: input.city || null,
      state: input.state || null,
      zip: input.zip || null,
      country: input.country || null,
      open_time: input.open_time || null,
      close_time: input.close_time || null,
      open_at: input.open_at ? new Date(input.open_at) : null,
      close_at: input.close_at ? new Date(input.close_at) : null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });
    const [data] = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
    return data;
  } catch (error) {
    throw error;
  }
}

export async function updateStore(id: string, input: Record<string, unknown>) {
  try {
    const updateData: Record<string, unknown> = {};
    const fields = [
      'name', 'slug', 'type', 'status', 'warehouse_id',
      'contact_name', 'contact_phone', 'address_line1', 'address_line2',
      'city', 'state', 'zip', 'country', 'open_time', 'close_time',
      'open_at', 'close_at', 'metadata',
    ];
    for (const field of fields) {
      if (input[field] !== undefined) {
        if (field === 'open_at' || field === 'close_at') {
          updateData[field] = input[field] ? new Date(input[field] as string) : null;
        } else {
          updateData[field] = input[field];
        }
      }
    }
    if (Object.keys(updateData).length > 0) {
      await db.update(stores).set(updateData).where(eq(stores.id, id));
    }
    const [data] = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
    return data;
  } catch (error) {
    throw error;
  }
}

export async function deleteStore(id: string) {
  try {
    await db.delete(stores).where(eq(stores.id, id));
    return { success: true };
  } catch (error) {
    throw error;
  }
}
