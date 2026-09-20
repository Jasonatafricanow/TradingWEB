import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { updateCategory, deleteCategory } from "@/services/admin/categories-service";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    await requireUser(request);
    const { id } = await params;
    const body = await request.json();

    const data = await updateCategory(id, body);
    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    await requireUser(request);
    const { id } = await params;

    await deleteCategory(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Error && (err as Error).message.includes("Cannot delete")) {
      return NextResponse.json({ error: (err as Error).message }, { status: 409 });
    }
    return errorResponse(err);
  }
}
