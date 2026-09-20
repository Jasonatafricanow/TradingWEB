import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { updateTrackingAction, OrderActionError } from "@/services/admin/order-actions-service";

// POST /api/admin/orders/[id]/update-tracking — 更新运单号
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const user = await requireUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await updateTrackingAction(id, { id: user.id }, {
      tracking_number: body?.tracking_number,
      carrier: body?.carrier,
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof OrderActionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return errorResponse(err);
  }
}
