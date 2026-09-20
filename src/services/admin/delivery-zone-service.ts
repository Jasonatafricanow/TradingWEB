import { db } from '@/lib/db';
import { deliveryZones } from '@/storage/database/shared/schema';
import { eq, asc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export interface DeliveryZoneInput {
  name: string;
  name_en?: string | null;
  base_rate: string;
  free_shipping_min?: string | null;
  time_slots?: Record<string, unknown> | null;
  is_active?: boolean;
  sort_order?: number;
}

export async function listDeliveryZones(activeOnly = false) {
  try {
    const query = activeOnly
      ? db.select().from(deliveryZones).where(eq(deliveryZones.is_active, true)).orderBy(asc(deliveryZones.sort_order))
      : db.select().from(deliveryZones).orderBy(asc(deliveryZones.sort_order));
    return await query;
  } catch (error) {
    throw error;
  }
}

export async function getDeliveryZone(id: string) {
  try {
    const [zone] = await db.select().from(deliveryZones).where(eq(deliveryZones.id, id)).limit(1);
    return zone || null;
  } catch (error) {
    throw error;
  }
}

export async function createDeliveryZone(input: DeliveryZoneInput) {
  try {
    const id = randomUUID();
    await db.insert(deliveryZones).values({
      id,
      name: input.name,
      name_en: input.name_en || null,
      base_rate: input.base_rate.toString(),
      free_shipping_min: input.free_shipping_min || null,
      time_slots: input.time_slots || null,
      is_active: input.is_active ?? true,
      sort_order: input.sort_order ?? 0,
    });
    return await getDeliveryZone(id);
  } catch (error) {
    throw error;
  }
}

export async function updateDeliveryZone(id: string, input: Partial<DeliveryZoneInput>) {
  try {
    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates.name = input.name;
    if ('name_en' in input) updates.name_en = input.name_en || null;
    if (input.base_rate !== undefined) updates.base_rate = input.base_rate.toString();
    if ('free_shipping_min' in input) updates.free_shipping_min = input.free_shipping_min || null;
    if ('time_slots' in input) updates.time_slots = input.time_slots || null;
    if ('is_active' in input) updates.is_active = input.is_active;
    if ('sort_order' in input) updates.sort_order = input.sort_order;
    updates.updated_at = new Date();

    await db.update(deliveryZones).set(updates).where(eq(deliveryZones.id, id));
    return await getDeliveryZone(id);
  } catch (error) {
    throw error;
  }
}

export async function deleteDeliveryZone(id: string) {
  try {
    await db.delete(deliveryZones).where(eq(deliveryZones.id, id));
  } catch (error) {
    throw error;
  }
}
