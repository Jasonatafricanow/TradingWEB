import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { requireStaffRole, requireUser, errorResponse } from "@/services/auth/auth-middleware"
import { findCustomer } from "@/services/admin/customer-lookup"
import { getUserMembership } from "@/services/admin/membership-service"
import { loadMemberPricing } from "@/services/promotions/member-pricing"
import { logAction } from "@/services/admin/audit-service"
import { optionalDate } from "@/lib/date-input"
import { API_MESSAGES } from "@/lib/api-messages"
import { db } from "@/lib/db"
import { membershipTiers, userMemberships } from "@/storage/database/shared/schema"

async function describe(userId: string) {
  const pricing = await loadMemberPricing(userId)
  const [membership] = await db.select().from(userMemberships).where(eq(userMemberships.user_id, userId)).limit(1)
  return {
    assigned_tier_id: membership?.assigned_tier_id ?? null,
    assigned_until: membership?.assigned_until ?? null,
    effective_tier_id: pricing.tier?.id ?? null,
    effective_tier_name: pricing.tierName,
    discount_percent: pricing.discountBps / 100,
    spent: (pricing.spentCents / 100).toFixed(2),
  }
}

// GET /api/admin/memberships/assign?q=<email or user id> — a customer's tier
export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin"])
    const customer = await findCustomer(new URL(request.url).searchParams.get("q") || "")
    if (!customer) return NextResponse.json({ error: API_MESSAGES.userNotFound }, { status: 404 })
    return NextResponse.json({ data: { customer, ...(await describe(customer.id)) } })
  } catch (err) {
    return errorResponse(err)
  }
}

// PUT /api/admin/memberships/assign — { user_id, tier_id | null, until? }
export async function PUT(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin"])
    const user = await requireUser(request)
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const customer = typeof body?.user_id === "string" ? await findCustomer(body.user_id) : null
    if (!customer) return NextResponse.json({ error: API_MESSAGES.userNotFound }, { status: 404 })
    const tierId = body?.tier_id === null || body?.tier_id === "" ? null : typeof body?.tier_id === "string" ? body.tier_id : undefined
    let until: Date | null | undefined
    try { until = optionalDate(body?.until) } catch { until = undefined; return NextResponse.json({ error: API_MESSAGES.invalidMembershipAssignment }, { status: 400 }) }
    if (tierId === undefined || (until && until <= new Date())) {
      return NextResponse.json({ error: API_MESSAGES.invalidMembershipAssignment }, { status: 400 })
    }
    if (tierId) {
      const [tier] = await db.select({ id: membershipTiers.id }).from(membershipTiers).where(eq(membershipTiers.id, tierId)).limit(1)
      if (!tier) return NextResponse.json({ error: API_MESSAGES.invalidMembershipAssignment }, { status: 400 })
    }
    await getUserMembership(customer.id) // creates the row when missing
    await db.transaction(async (tx) => {
      await tx.update(userMemberships).set({
        assigned_tier_id: tierId,
        assigned_until: tierId ? until ?? null : null,
        updated_at: new Date(),
      }).where(eq(userMemberships.user_id, customer.id))
      await logAction({
        userId: user.id, action: "membership.assign", entityType: "user", entityId: customer.id,
        details: { tier_id: tierId, until: tierId && until ? until.toISOString() : null },
      }, tx)
    })
    return NextResponse.json({ data: { customer, ...(await describe(customer.id)) } })
  } catch (err) {
    return errorResponse(err)
  }
}
