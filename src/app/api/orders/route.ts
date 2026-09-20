import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/services/auth/auth-middleware";
import { listUserOrders, createOrder } from "@/services/orders/order-service";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const source = searchParams.get("source") || undefined;
    const search = searchParams.get("search") || undefined;
    const limit = Number(searchParams.get("limit")) || 50;

    // 如果是后台/POS员工，允许拉取所有人的订单（全渠道），并支持搜索与来源过滤
    if (user.staffId) {
      const conditions: string[] = [];
      const bindings: any[] = [];

      if (source && source !== "all") {
        conditions.push("source = ?");
        bindings.push(source);
      }
      if (status && status !== "all") {
        conditions.push("status = ?");
        bindings.push(status);
      }
      if (search) {
        conditions.push("(order_no LIKE ? OR buyer_phone LIKE ? OR buyer_name LIKE ? OR buyer_email LIKE ?)");
        const q = `%${search.trim()}%`;
        bindings.push(q, q, q, q);
      }

      const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
      
      const [rows] = await db.$client.execute(
        `SELECT * FROM orders ${whereClause} ORDER BY created_at DESC LIMIT ?`,
        [...bindings, String(limit)]
      );

      const data = rows as Record<string, any>[];
      const withItems = await Promise.all(
        data.map(async (order) => {
          const [items] = await db.$client.execute(
            `SELECT * FROM order_items WHERE order_id = ?`,
            [order.id]
          );
          return { ...order, items, order_items: items };
        })
      );

      return NextResponse.json(withItems);
    }

    const result = await listUserOrders(user.id, status);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await request.json();
    const { items, paymentMethod, buyerEmail, buyerName, buyerPhone, couponCode } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const mappedItems = items.map((item: { id?: string; product_id?: string; quantity?: number; variant_id?: string | null; delivery_method?: string | null }) => ({
      product_id: item.product_id || item.id || "",
      quantity: item.quantity || 1,
      variant_id: item.variant_id || null,
      delivery_method: item.delivery_method || null,
    }));

    if (mappedItems.some((item) => !item.product_id)) {
      return NextResponse.json({ error: "Invalid order item" }, { status: 400 });
    }

    const result = await createOrder({
      user_id: user.id,
      items: mappedItems,
      buyer_email: buyerEmail,
      buyer_name: buyerName,
      buyer_phone: buyerPhone,
      payment_method: paymentMethod,
      coupon_code: couponCode,
      source: body.source,
      delivery_zone_id: body.delivery_zone_id,
      shipping_cost: body.shipping_cost,
      delivery_date: body.delivery_date,
      delivery_time_slot: body.delivery_time_slot,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
