import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { createRefundAction, OrderActionError } from "@/services/admin/order-actions-service";

// POST /api/admin/orders/[id]/create-refund — 发起退款(pending,审批走退款模块)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const user = await requireUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await createRefundAction(id, { id: user.id }, {
      amount: body?.amount,
      reason: body?.reason,
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof OrderActionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return errorResponse(err);
  }
}
