import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { updatePaymentMethod, deletePaymentMethod } from "@/services/admin/payment-method-service";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin"]);
    const { id } = await params;
    const body = await request.json();

    const data = await updatePaymentMethod(id, {
      name: body.name,
      name_en: body.name_en,
      type: body.type,
      enabled: body.enabled,
      sort_order: body.sort_order,
    });

    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin"]);
    const { id } = await params;

    await deletePaymentMethod(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
