import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { listTiers, updateTier, createTier } from "@/services/admin/membership-service"
import { API_MESSAGES } from "@/lib/api-messages";
import { assertWindow, optionalDate } from "@/lib/date-input";
import { logActionSafely } from "@/services/admin/audit-service";

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
    const user = await requireUser(request)
    const body = await request.json()
    const { id, discount_starts_at, discount_ends_at, ...rest } = body
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })
    if (rest.discount_percent !== undefined && (!Number.isFinite(Number(rest.discount_percent)) || Number(rest.discount_percent) < 0 || Number(rest.discount_percent) > 100)) {
      return NextResponse.json({ error: API_MESSAGES.invalidMembershipTier }, { status: 400 })
    }
    let starts: Date | null | undefined
    let ends: Date | null | undefined
    try {
      starts = optionalDate(discount_starts_at)
      ends = optionalDate(discount_ends_at)
      assertWindow(starts, ends)
    } catch {
      return NextResponse.json({ error: API_MESSAGES.invalidMembershipTier }, { status: 400 })
    }
    const updates = { name: rest.name, min_total_spent: rest.min_total_spent, discount_percent: rest.discount_percent,
      badge_color: rest.badge_color, benefits: rest.benefits, is_active: rest.is_active,
      discount_starts_at: starts, discount_ends_at: ends }
    const data = await updateTier(id, updates)
    await logActionSafely({ userId: user.id, action: "membership_tier.update", entityType: "membership_tier", entityId: id,
      details: { discount_percent: rest.discount_percent ?? null, min_total_spent: rest.min_total_spent ?? null,
        is_active: rest.is_active ?? null, discount_starts_at: starts ?? null, discount_ends_at: ends ?? null } })
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
