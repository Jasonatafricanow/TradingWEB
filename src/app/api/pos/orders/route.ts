import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/services/auth/auth-middleware";
import { allocateInventory } from "@/services/inventory/inventory-allocation-service";
import {
  orderItems,
  orders,
  orderTimeline,
  products,
  productVariants,
  staff,
} from "@/storage/database/shared/schema";

export const dynamic = "force-dynamic";

interface LegacyPosOrderItem {
  product_id: string;
  variant_id?: string | null;
  quantity?: number;
  unit_price?: string | number;
  line_discount?: string | number;
  delivery_method?: string;
}

interface LegacyPosOrderBody {
  staff_id?: string;
  client_ref?: string;
  items?: LegacyPosOrderItem[];
  customer_id?: string;
  customer_name?: string;
  buyer_name?: string;
  buyer_phone?: string;
  discount_total?: string | number;
  payments?: Array<{ method?: string }>;
  delivery_date?: string;
  delivery_time_slot?: string;
  shipping_address?: unknown;
  note?: string;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user.staffId) {
      return NextResponse.json({ error: "POS staff authorization required" }, { status: 403 });
    }

    const body = await request.json() as LegacyPosOrderBody;
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: "At least one order item is required" }, { status: 400 });
    }
    const staffId = user.staffId;
    const paymentId = body.client_ref
      ? `pos:${staffId}:${body.client_ref}`
      : `pos:${staffId}:${randomUUID()}`;

    if (body.client_ref) {
      const [existing] = await db.select().from(orders).where(eq(orders.payment_id, paymentId)).limit(1);
      if (existing) {
        const items = await db.select().from(orderItems).where(eq(orderItems.order_id, existing.id));
        return NextResponse.json({ ...existing, items, order_items: items });
      }
    }

    const [staffMember] = await db.select({ storeId: staff.store_id })
      .from(staff).where(eq(staff.id, user.staffId)).limit(1);
    const storeId = staffMember?.storeId ?? null;
    const fulfillmentStatus = body.items.some((item) =>
      item.delivery_method === "pickup" || item.delivery_method === "ship"
    ) ? "unfulfilled" : "fulfilled";
    const orderId = randomUUID();
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const orderNo = `POS${date}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const result = await db.transaction(async (tx) => {
      const receiptItems: Array<typeof orderItems.$inferInsert> = [];
      let subtotal = 0;

      for (const item of body.items ?? []) {
        const quantity = Number(item.quantity ?? 1);
        if (!Number.isInteger(quantity) || quantity < 1) {
          throw new Error("Item quantity must be a positive integer");
        }
        const [product] = await tx.select({
          id: products.id,
          title: products.title,
          price: products.price,
          type: products.type,
          barcode: products.barcode,
        }).from(products).where(eq(products.id, item.product_id)).limit(1);
        if (!product) throw new Error(`Product not found: ${item.product_id}`);

        let unitPrice = Number(item.unit_price ?? product.price ?? 0);
        let sku = product.barcode ?? null;
        let title = product.title;
        if (item.variant_id) {
          const [variant] = await tx.select({
            id: productVariants.id,
            title: productVariants.title,
            sku: productVariants.sku,
            price: productVariants.price,
          }).from(productVariants).where(and(
            eq(productVariants.id, item.variant_id),
            eq(productVariants.product_id, item.product_id),
          )).limit(1);
          if (!variant) throw new Error(`Variant not found for product: ${item.variant_id}`);
          unitPrice = Number(item.unit_price ?? variant.price ?? 0);
          sku = variant.sku ?? null;
          title = variant.title ? `${product.title} - ${variant.title}` : product.title;
        }

        const lineSubtotal = unitPrice * quantity;
        subtotal += lineSubtotal;
        receiptItems.push({
          id: randomUUID(),
          order_id: orderId,
          product_id: item.product_id,
          variant_id: item.variant_id ?? null,
          product_title: title,
          product_type: product.type,
          sku,
          quantity,
          unit_price: unitPrice.toFixed(2),
          subtotal: (lineSubtotal - Number(item.line_discount ?? 0)).toFixed(2),
          delivery_method: item.delivery_method ?? "in_store",
          created_at: now,
        });
      }

      const discountTotal = Number(body.discount_total ?? 0);
      const totalAmount = Math.max(0, subtotal - discountTotal).toFixed(2);
      await tx.insert(orders).values({
        id: orderId,
        order_no: orderNo,
        user_id: body.customer_id ? String(body.customer_id) : "pos-guest",
        store_id: storeId,
        source: "pos",
        status: "completed",
        financial_status: "paid",
        payment_status: "paid",
        fulfillment_status: fulfillmentStatus,
        total_amount: totalAmount,
        payment_method: body.payments?.[0]?.method ?? "cash",
        payment_id: paymentId,
        buyer_name: body.buyer_name ?? body.customer_name ?? null,
        buyer_phone: body.buyer_phone ?? null,
        delivery_date: body.delivery_date ?? null,
        delivery_time_slot: body.delivery_time_slot ?? null,
        shipping_address: body.shipping_address,
        notes: body.note ?? null,
        discount_amount: discountTotal > 0 ? discountTotal.toFixed(2) : null,
        created_at: now,
        updated_at: now,
      });
      await tx.insert(orderItems).values(receiptItems);
      await allocateInventory({
        storeId,
        operatorId: String(staffId),
        referenceType: "order",
        referenceId: orderId,
        note: "Legacy POS sale",
        lines: receiptItems.map((item) => ({
          productId: item.product_id,
          variantId: item.variant_id ?? null,
          productType: item.product_type,
          title: item.product_title,
          quantity: item.quantity ?? 1,
        })),
      }, undefined, tx);
      await tx.insert(orderTimeline).values({
        id: randomUUID(),
        order_id: orderId,
        action: "pos_sale",
        description: `POS sale @ ${storeId ?? "default"}, payment ${body.payments?.[0]?.method ?? "cash"}`,
        new_value: totalAmount,
        operator_id: String(staffId),
        created_at: now,
      });
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      return { ...order, items: receiptItems, order_items: receiptItems };
    });

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
