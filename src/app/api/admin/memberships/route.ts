import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { listTiers, updateTier, createTier } from "@/services/admin/membership-service"
import { API_MESSAGES } from "@/lib/api-messages";

// GET /api/admin/memberships — 等级列表
export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const result = await listTiers()
    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}

// PUT /api/admin/memberships — 更新等级
export async function PUT(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    await requireUser(request)
    const body = await request.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    const data = await updateTier(id, updates)
    return NextResponse.json({ data })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const body = await request.json();
    if (typeof body.name !== "string" || !body.name.trim() || !Number.isInteger(body.level) || body.level <= 0
      || !Number.isFinite(Number(body.min_total_spent)) || Number(body.min_total_spent) < 0
      || !Number.isFinite(Number(body.discount_percent)) || Number(body.discount_percent) < 0 || Number(body.discount_percent) > 100) {
      return NextResponse.json({ error: API_MESSAGES.invalidMembershipTier }, { status: 400 });
    }
    const data = await createTier({ name: body.name.trim(), level: body.level,
      min_total_spent: Number(body.min_total_spent).toFixed(2), discount_percent: Number(body.discount_percent).toFixed(2),
      benefits: typeof body.benefits === "string" ? body.benefits : undefined, is_active: true });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) { return errorResponse(err); }
}
