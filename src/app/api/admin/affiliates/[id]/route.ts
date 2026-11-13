import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { reviewAffiliate } from "@/services/affiliate/affiliate-service"
import { db } from "@/lib/db"
import { assertWindow, optionalDate } from "@/lib/date-input"
import { logActionSafely } from "@/services/admin/audit-service"
import { API_MESSAGES } from "@/lib/api-messages"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin", "operator"])
    const admin = await requireUser(request)
    const { id } = await params
    const body = await request.json()

    const commissionFields = ["rate", "max_commission", "commission_starts_at", "commission_ends_at"]
    if (commissionFields.some((field) => body[field] !== undefined)) {
      const sets: string[] = []
      const values: Array<string | Date | null> = []
      if (body.rate !== undefined) {
        const rate = parseFloat(body.rate)
        if (isNaN(rate) || rate < 0 || rate > 100) {
          return NextResponse.json({ error: "Commission rate must be between 0 and 100" }, { status: 400 })
        }
        sets.push("rate = ?"); values.push(rate.toFixed(2))
      }
      if (body.max_commission !== undefined) {
        const max = body.max_commission === null || body.max_commission === "" ? null : Number(body.max_commission)
        if (max !== null && (!Number.isFinite(max) || max < 0)) {
          return NextResponse.json({ error: API_MESSAGES.invalidAffiliateCommission }, { status: 400 })
        }
        sets.push("max_commission = ?"); values.push(max === null ? null : max.toFixed(2))
      }
      let starts: Date | null | undefined
      let ends: Date | null | undefined
      try {
        starts = optionalDate(body.commission_starts_at)
        ends = optionalDate(body.commission_ends_at)
        const [current] = await db.$client.execute("SELECT commission_starts_at, commission_ends_at FROM affiliates WHERE id = ?", [id]) as unknown as [Array<{ commission_starts_at: Date | null; commission_ends_at: Date | null }>]
        assertWindow(starts === undefined ? current[0]?.commission_starts_at : starts, ends === undefined ? current[0]?.commission_ends_at : ends)
      } catch {
        return NextResponse.json({ error: API_MESSAGES.invalidAffiliateCommission }, { status: 400 })
      }
      if (starts !== undefined) { sets.push("commission_starts_at = ?"); values.push(starts) }
      if (ends !== undefined) { sets.push("commission_ends_at = ?"); values.push(ends) }
      await db.$client.execute(`UPDATE affiliates SET ${sets.join(", ")} WHERE id = ?`, [...values, id])
      await logActionSafely({ userId: admin.id, action: "affiliate.commission_update", entityType: "affiliate", entityId: id,
        details: { rate: body.rate ?? null, max_commission: body.max_commission ?? null,
          commission_starts_at: starts ?? null, commission_ends_at: ends ?? null } })
      const [rows] = await db.$client.execute("SELECT * FROM affiliates WHERE id = ?", [id])
      const data = (rows as Record<string, unknown>[])[0]
      return NextResponse.json({ data })
    }

    if (body.status) {
      if (!["active", "suspended"].includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 })
      }
      const data = await reviewAffiliate(id, body.status, admin.id)
      return NextResponse.json({ data })
    }

    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  } catch (err) {
    return errorResponse(err)
  }
}
