import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import {
  createProductType,
  listProductTypes,
  validateProductTypeCode,
} from "@/services/admin/product-type-service";
import { PRODUCT_TYPE_DEFS } from "@/config/product-types";

const BUILTIN_CODES = PRODUCT_TYPE_DEFS.map((type) => type.code);

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active") === "true" ? true : undefined;
    const result = await listProductTypes(active !== undefined ? { active } : undefined);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin"]);
    const body = await request.json();

    if (!body.code || !body.label) {
      return NextResponse.json({ error: "code and label are required" }, { status: 400 });
    }

    const code = String(body.code).trim().toLowerCase();
    const label = String(body.label).trim();
    const codeError = validateProductTypeCode(code);
    if (codeError) {
      return NextResponse.json({ error: codeError }, { status: 400 });
    }
    if (!label) {
      return NextResponse.json({ error: "label is required" }, { status: 400 });
    }
    if (BUILTIN_CODES.includes(code)) {
      return NextResponse.json({ error: `code "${code}" is a built-in product type` }, { status: 409 });
    }

    const data = await createProductType({
      code,
      label,
      label_en: body.label_en ? String(body.label_en).trim() : undefined,
      description: body.description ? String(body.description).trim() : undefined,
      sort_order: body.sort_order,
      is_active: body.is_active,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("already exists")) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return errorResponse(err);
  }
}
