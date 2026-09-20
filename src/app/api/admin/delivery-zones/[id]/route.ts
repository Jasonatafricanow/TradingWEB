import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { getDeliveryZone, updateDeliveryZone, deleteDeliveryZone } from "@/services/admin/delivery-zone-service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const { id } = await params;
    const data = await getDeliveryZone(id);
    if (!data) return NextResponse.json({ error: "Delivery zone not found" }, { status: 404 });
    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffRole(request, ["admin"]);
    const { id } = await params;
    const body = await request.json();
    const data = await updateDeliveryZone(id, body);
    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffRole(request, ["admin"]);
    const { id } = await params;
    await deleteDeliveryZone(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
