import { NextRequest, NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/services/auth/auth-middleware";
import { getOrder, updateOrder } from "@/services/orders/order-service";

// GET /api/orders/[id] — 获取订单详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser(request);
    const { id } = await params;

    const order = await getOrder(id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    // 验证订单属于当前用户（管理员除外）
    if (order.user_id !== user.id && !user.role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    return NextResponse.json({ data: order });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser(request);
    const body = await request.json();
    const { id } = await params;
    const { status } = body as { status?: string };

    const order = await getOrder(id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (status !== "cancelled") {
      return NextResponse.json({ error: "Only cancellation is allowed" }, { status: 400 });
    }
    if (order.status !== "pending") {
      return NextResponse.json({ error: "Only pending orders can be cancelled" }, { status: 409 });
    }

    const data = await updateOrder(id, { status: "cancelled" });
    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}
