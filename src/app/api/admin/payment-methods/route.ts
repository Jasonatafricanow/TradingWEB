import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import {
  listPaymentMethods,
  createPaymentMethod,
  validatePaymentMethodCode,
} from "@/services/admin/payment-method-service";

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const { searchParams } = new URL(request.url);
    const enabledOnly = searchParams.get("enabled") === "true" ? true : undefined;
    const result = await listPaymentMethods(enabledOnly !== undefined ? { enabled: enabledOnly } : undefined);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin"]);
    const body = await request.json();

    if (!body.code || !body.name || !body.type) {
      return NextResponse.json({ error: "code, name, and type are required" }, { status: 400 });
    }

    const codeErr = validatePaymentMethodCode(body.code);
    if (codeErr) {
      return NextResponse.json({ error: codeErr }, { status: 400 });
    }

    const data = await createPaymentMethod({
      code: body.code,
      name: body.name,
      name_en: body.name_en,
      type: body.type,
      sort_order: body.sort_order,
    });

    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}
