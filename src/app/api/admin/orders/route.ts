import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { listOrdersPaginated, listAllOrders, getOrderViewCounts } from "@/services/admin/orders-service";
import { db } from "@/lib/db";
import { orders } from "@/storage/database/shared/schema";
import { eq } from "drizzle-orm";
import { emptyToNull, moneyOrZero, dateOrNull } from "@/lib/sanitize";
import { randomUUID } from "node:crypto";



function generateOrderNo(): string {
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return "ORD" + dateStr + random;
}

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator", "support"]);
    await requireUser(request);
    const { searchParams } = new URL(request.url);

    // Saved Views 角标计数
    if (searchParams.get("view_counts")) {
      const counts = await getOrderViewCounts();
      return NextResponse.json({ data: counts });
    }

    const page = searchParams.get("page");
    if (page) {
      const result = await listOrdersPaginated({
        page: Number(page),
        limit: Number(searchParams.get("pageSize") || searchParams.get("limit")) || 20,
        status: searchParams.get("status") || undefined,
        search: searchParams.get("search") || undefined,
        date_from: searchParams.get("date_from") || undefined,
        date_to: searchParams.get("date_to") || undefined,
        sort_by: searchParams.get("sort_by") || undefined,
        sort_order: (searchParams.get("sort_order") as "asc" | "desc") || undefined,
        view: searchParams.get("view") || undefined,
      });
      return NextResponse.json(result);
    }
    
    const result = await listAllOrders();
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    await requireUser(request);
    const body = await request.json();
    
    // 按邮箱查找或创建客户
    let userId = body.user_id || "guest";
    if (body.buyer_email) {
      try {
        const [existing] = await db.$client.execute(
          'SELECT id FROM users WHERE email = ? LIMIT 1',
          [body.buyer_email]
        );
        const rows = existing as { id: string }[];
        if (rows.length > 0) {
          userId = rows[0].id;
        } else if (body.create_customer !== false) {
          // 自动创建用户记录
          const newId = randomUUID();
          await db.$client.execute(
            'INSERT INTO users (id, email, name, phone, created_at) VALUES (?, ?, ?, ?, NOW())',
            [newId, body.buyer_email, body.buyer_name || null, body.buyer_phone || null]
          );
          userId = newId;
        }
      } catch {
        // users table may not exist, fallback to guest
      }
    }
    
    const orderId = randomUUID();
    const orderNo = generateOrderNo();
    
    // 构建地址 JSON
    const shippingAddress = body.shipping_address ? {
      address_line1: body.shipping_address.address_line1,
      address_line2: body.shipping_address.address_line2 || null,
      city: body.shipping_address.city,
      state: body.shipping_address.state || null,
      zip: body.shipping_address.zip || null,
      country: body.shipping_address.country || "Moz",
      phone: body.buyer_phone || null,
    } : null;

    const orderData = {
      id: orderId,
      order_no: orderNo,
      user_id: userId,
      source: body.source || "web",
      status: body.status || "paid",
      total_amount: moneyOrZero(body.total_amount),
      buyer_email: emptyToNull(body.buyer_email),
      buyer_name: emptyToNull(body.buyer_name),
      buyer_phone: emptyToNull(body.buyer_phone),
      delivery_zone_id: emptyToNull(body.delivery_zone_id),
      shipping_cost: moneyOrZero(body.shipping_cost),
      delivery_date: dateOrNull(body.delivery_date),
      delivery_time_slot: emptyToNull(body.delivery_time_slot),
      shipping_address: shippingAddress as any,
      notes: emptyToNull(body.notes),
    };

    await db.insert(orders).values(orderData);
    
    const [row] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    return NextResponse.json({ data: row });
  } catch (err: any) {
    console.error("Order insert failed:", err);
    console.error("Database cause:", err?.cause);
    console.error("DB code:", err?.cause?.code);
    console.error("DB message:", err?.cause?.sqlMessage);
    return errorResponse(err);
  }
}
