import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { cancelAction, OrderActionError } from "@/services/admin/order-actions-service";

// POST /api/admin/orders/[id]/cancel — 取消订单(已扣库存自动回补)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const user = await requireUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await cancelAction(id, { id: user.id }, body?.reason);
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof OrderActionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return errorResponse(err);
  }
}
