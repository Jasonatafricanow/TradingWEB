import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { getAdminOrderDetail, updateAdminOrder } from "@/services/admin/orders-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin", "operator", "support"]);
    await requireUser(request);
    const { id } = await params;
    const data = await getAdminOrderDetail(id);
    if (!data) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const user = await requireUser(request);
    const { id } = await params;
    const body = await request.json();
    const data = await updateAdminOrder(id, { ...body, _operator_id: user.id });
    if (!data) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const user = await requireUser(request);
    const { id } = await params;
    const body = await request.json();
    const data = await updateAdminOrder(id, { ...body, _operator_id: user.id });
    if (!data) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}
