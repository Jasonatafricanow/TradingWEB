import { db } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { shipments, shipmentItems, orders, stores } from '@/storage/database/shared/schema';
import { randomUUID } from 'node:crypto';

export async function listShipments() {
  try {
    const data = await db
      .select()
      .from(shipments)
      .leftJoin(orders, eq(shipments.order_id, orders.id))
      .leftJoin(stores, eq(shipments.store_id, stores.id))
      .orderBy(desc(shipments.created_at));
    return { data: data || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

export async function getShipment(id: string) {
  try {
    const [data] = await db
      .select()
      .from(shipments)
      .leftJoin(orders, eq(shipments.order_id, orders.id))
      .leftJoin(stores, eq(shipments.store_id, stores.id))
      .where(eq(shipments.id, id))
      .limit(1);
    const items = await db
      .select()
      .from(shipmentItems)
      .where(eq(shipmentItems.shipment_id, id));
    return { data: { ...data, items: items || [] }, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export async function createShipment(input: {
  order_id: string; store_id?: string; tracking_number?: string;
  carrier?: string; carrier_code?: string; status?: string;
  shipping_method?: string; estimated_delivery?: string;
  weight?: number; weight_unit?: string; package_count?: number;
  notes?: string; tracking_events?: Record<string, unknown>[];
}) {
  try {
    const id = randomUUID();
    await db.insert(shipments).values({
      id,
      order_id: input.order_id,
      store_id: input.store_id || null,
      tracking_number: input.tracking_number || null,
      carrier: input.carrier || null,
      carrier_code: input.carrier_code || null,
      status: input.status || 'pending',
      shipping_method: input.shipping_method || null,
      estimated_delivery: input.estimated_delivery ? new Date(input.estimated_delivery) : null,
      weight: input.weight ? String(input.weight) : null,
      weight_unit: input.weight_unit || 'kg',
      package_count: input.package_count || 1,
      notes: input.notes || null,
      tracking_events: input.tracking_events ? JSON.stringify(input.tracking_events) : null,
    });
    const [data] = await db.select().from(shipments).where(eq(shipments.id, id)).limit(1);
    return data;
  } catch (error) {
    throw error;
  }
}

export async function updateShipment(id: string, input: Record<string, unknown>) {
  try {
    const updateData: Record<string, unknown> = {};
    const fields = [
      'tracking_number', 'carrier', 'carrier_code', 'status',
      'shipping_method', 'estimated_delivery', 'shipped_at', 'delivered_at',
      'weight', 'weight_unit', 'package_count', 'notes', 'tracking_events',
    ];
    for (const field of fields) {
      if (input[field] !== undefined) {
        if (['estimated_delivery', 'shipped_at', 'delivered_at'].includes(field)) {
          updateData[field] = input[field] ? new Date(input[field] as string) : null;
        } else {
          updateData[field] = input[field];
        }
      }
    }
    if (input.store_id !== undefined) updateData.store_id = input.store_id;
    if (Object.keys(updateData).length > 0) {
      await db.update(shipments).set(updateData).where(eq(shipments.id, id));
    }
    const [data] = await db.select().from(shipments).where(eq(shipments.id, id)).limit(1);
    return data;
  } catch (error) {
    throw error;
  }
}

export async function addTrackingEvent(id: string, event: { status: string; location?: string; timestamp: string; description?: string }) {
  try {
    const [shipment] = await db.select().from(shipments).where(eq(shipments.id, id)).limit(1);
    if (!shipment) throw new Error('shipment not found');
    const events = (shipment.tracking_events as Record<string, unknown>[]) || [];
    events.push(event);
    await db.update(shipments).set({
      tracking_events: JSON.stringify(events),
      status: event.status || shipment.status,
    }).where(eq(shipments.id, id));
    const [data] = await db.select().from(shipments).where(eq(shipments.id, id)).limit(1);
    return data;
  } catch (error) {
    throw error;
  }
}
