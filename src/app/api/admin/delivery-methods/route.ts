import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { asc, and, eq, isNull } from "drizzle-orm";
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { DELIVERY_METHODS } from "@/config/delivery-methods";
import { db } from "@/lib/db";
import { listProductTypes } from "@/services/admin/product-type-service";
import { deliveryMethods } from "@/storage/database/shared/schema";

const DEFAULT_METHODS = DELIVERY_METHODS.map((m) => ({
  id: `builtin-${m.code}`,
  code: m.code,
  label: m.label,
  label_en: m.i18nKey.replace("delivery.", ""),
  applicable_types: m.applicableTypes,
  sort_order: m.sort,
  is_active: true as const,
  is_builtin: true as const,
}));

function normalizeText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function getActiveProductTypeCodes(): Promise<Set<string>> {
  const result = await listProductTypes({ active: true });
  return new Set((result.data || []).map((type) => type.code));
}

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);

    let customMethods: Array<Record<string, unknown>> = [];
    try {
      const rows = await db
        .select()
        .from(deliveryMethods)
        .where(and(eq(deliveryMethods.is_active, true), isNull(deliveryMethods.deleted_at)))
        .orderBy(asc(deliveryMethods.sort_order));

      customMethods = rows.map((row) => ({
        id: row.id,
        code: row.code,
        label: row.label,
        label_en: row.label_en,
        applicable_types: row.applicable_types,
        sort_order: row.sort_order,
        is_active: true,
        is_builtin: false,
      }));
    } catch {
      customMethods = [];
    }

    const codeMap = new Map<string, (typeof DEFAULT_METHODS)[number]>();
    for (const method of DEFAULT_METHODS) codeMap.set(method.code, method);
    for (const method of customMethods) {
      codeMap.set(method.code as string, method as unknown as (typeof DEFAULT_METHODS)[number]);
    }

    const merged = Array.from(codeMap.values()).sort((a, b) => a.sort_order - b.sort_order);
    return NextResponse.json({ data: merged });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin"]);

    const body = await request.json();
    const code = normalizeText(body.code, 64).toLowerCase();
    const label = normalizeText(body.label, 128);
    const labelEn = normalizeText(body.label_en, 128) || null;
    const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;

    if (!code || !label) {
      return NextResponse.json({ error: "code and label are required" }, { status: 400 });
    }

    if (!/^[a-z0-9][a-z0-9_-]*$/.test(code)) {
      return NextResponse.json(
        { error: "code must start with a lowercase letter or digit, and may contain lowercase letters, digits, underscores, and hyphens" },
        { status: 400 }
      );
    }

    const types: string[] = Array.isArray(body.applicable_types)
      ? [...new Set<string>(body.applicable_types.map((type: unknown) => normalizeText(type, 64)).filter(Boolean))]
      : [];
    if (types.length === 0) {
      return NextResponse.json({ error: "at least one applicable type is required" }, { status: 400 });
    }

    const activeTypeCodes = await getActiveProductTypeCodes();
    const invalidTypes = types.filter((type) => !activeTypeCodes.has(type));
    if (invalidTypes.length > 0) {
      return NextResponse.json(
        { error: `invalid applicable type(s): ${invalidTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const builtinCodes = DEFAULT_METHODS.map((method) => method.code);
    if (builtinCodes.includes(code)) {
      return NextResponse.json({ error: `code "${code}" conflicts with a built-in delivery method` }, { status: 409 });
    }

    const existing = await db
      .select({ id: deliveryMethods.id })
      .from(deliveryMethods)
      .where(and(eq(deliveryMethods.code, code), isNull(deliveryMethods.deleted_at)))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ error: `code "${code}" already exists` }, { status: 409 });
    }

    const id = randomUUID();
    await db.insert(deliveryMethods).values({
      id,
      code,
      label,
      label_en: labelEn,
      applicable_types: types,
      sort_order: sortOrder,
      is_active: true,
    });

    return NextResponse.json({
      data: {
        id,
        code,
        label,
        label_en: labelEn,
        applicable_types: types,
        sort_order: sortOrder,
        is_active: true,
        is_builtin: false,
      },
    }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
