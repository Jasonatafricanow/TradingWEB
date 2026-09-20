import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { markPaidAction, OrderActionError } from "@/services/admin/order-actions-service";

// POST /api/admin/orders/[id]/mark-paid — 确认收款(COD/线下转账)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const user = await requireUser(request);
    const { id } = await params;
    const result = await markPaidAction(id, { id: user.id });
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof OrderActionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return errorResponse(err);
  }
}
