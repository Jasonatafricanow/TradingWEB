import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { listCategories, createCategory } from "@/services/admin/categories-service";

export async function GET(request: Request) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    await requireUser(request);
    const result = await listCategories();
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    await requireUser(request);
    const body = await request.json();
    const { name, name_en, name_ja, name_es, type, icon, sort_order, is_active } = body;

    if (!name || !type) {
      return NextResponse.json({ error: "name and type are required" }, { status: 400 });
    }

    const data = await createCategory({ name, name_en, name_ja, name_es, type, icon, sort_order, is_active });
    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}
