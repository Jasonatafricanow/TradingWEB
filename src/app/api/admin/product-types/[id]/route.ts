import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { deleteProductType, updateProductType } from "@/services/admin/product-type-service";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin"]);
    const { id } = await params;
    const body = await request.json();

    if (body.label !== undefined && !String(body.label).trim()) {
      return NextResponse.json({ error: "label is required" }, { status: 400 });
    }

    const data = await updateProductType(id, {
      label: body.label !== undefined ? String(body.label).trim() : undefined,
      label_en: body.label_en !== undefined ? String(body.label_en).trim() : undefined,
      description: body.description !== undefined ? String(body.description).trim() : undefined,
      sort_order: body.sort_order,
      is_active: body.is_active,
    });

    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Cannot ")) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
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

    const deleted = await deleteProductType(id);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Cannot ")) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return errorResponse(err);
  }
}
