import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole, requireUser, errorResponse } from "@/services/auth/auth-middleware";
import { updateCustomerTags } from "@/services/admin/customer-service";
import { logAction } from "@/services/admin/audit-service";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const operator = await requireUser(request);
    const { id } = await params;
    const body = await request.json();
    const result = await updateCustomerTags(id, body.tags || "");
    await logAction({
      userId: operator.id,
      action: "customer.update_tags",
      entityType: "customer",
      entityId: id,
      details: { tags: body.tags || "" },
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
