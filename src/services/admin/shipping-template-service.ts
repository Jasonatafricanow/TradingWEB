import { db } from '@/lib/db';
import { shippingTemplates } from '@/storage/database/shared/schema';
import { eq, desc, asc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export interface ShippingTemplateInput {
  name: string;
  type: 'flat' | 'weight_based' | 'price_based' | 'free_shipping';
  base_rate: string;
  free_shipping_min?: string | null;
  conditions?: Record<string, unknown> | null;
  regions?: Record<string, unknown> | null;
  description?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export async function listShippingTemplates(activeOnly = false) {
  try {
    const query = activeOnly
      ? db.select().from(shippingTemplates).where(eq(shippingTemplates.is_active, true)).orderBy(asc(shippingTemplates.sort_order))
      : db.select().from(shippingTemplates).orderBy(asc(shippingTemplates.sort_order));
    return await query;
  } catch (error) {
    throw error;
  }
}

export async function getShippingTemplate(id: string) {
  try {
    const [template] = await db.select().from(shippingTemplates).where(eq(shippingTemplates.id, id)).limit(1);
    return template || null;
  } catch (error) {
    throw error;
  }
}

export async function createShippingTemplate(input: ShippingTemplateInput) {
  try {
    const id = randomUUID();
    await db.insert(shippingTemplates).values({
      id,
      name: input.name,
      type: input.type,
      base_rate: input.base_rate.toString(),
      free_shipping_min: input.free_shipping_min || null,
      conditions: input.conditions || null,
      regions: input.regions || null,
      description: input.description || null,
      is_active: input.is_active ?? true,
      sort_order: input.sort_order ?? 0,
    });
    return await getShippingTemplate(id);
  } catch (error) {
    throw error;
  }
}

export async function updateShippingTemplate(id: string, input: Partial<ShippingTemplateInput>) {
  try {
    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.type !== undefined) updates.type = input.type;
    if (input.base_rate !== undefined) updates.base_rate = input.base_rate.toString();
    if ('free_shipping_min' in input) updates.free_shipping_min = input.free_shipping_min || null;
    if ('conditions' in input) updates.conditions = input.conditions || null;
    if ('regions' in input) updates.regions = input.regions || null;
    if ('description' in input) updates.description = input.description || null;
    if ('is_active' in input) updates.is_active = input.is_active;
    if ('sort_order' in input) updates.sort_order = input.sort_order;
    updates.updated_at = new Date();

    await db.update(shippingTemplates).set(updates).where(eq(shippingTemplates.id, id));
    return await getShippingTemplate(id);
  } catch (error) {
    throw error;
  }
}

export async function deleteShippingTemplate(id: string) {
  try {
    await db.delete(shippingTemplates).where(eq(shippingTemplates.id, id));
  } catch (error) {
    throw error;
  }
}