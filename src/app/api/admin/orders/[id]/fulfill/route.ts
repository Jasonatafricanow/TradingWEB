import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { fulfillAction, OrderActionError } from "@/services/admin/order-actions-service";

// POST /api/admin/orders/[id]/fulfill — 发货/标记履约(可带运单号)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const user = await requireUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await fulfillAction(id, { id: user.id }, {
      tracking_number: body?.tracking_number,
      carrier: body?.carrier,
      notes: body?.notes,
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof OrderActionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return errorResponse(err);
  }
}
