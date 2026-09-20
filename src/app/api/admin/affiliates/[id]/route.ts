import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { reviewAffiliate } from "@/services/affiliate/affiliate-service"
import { db } from "@/lib/db"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin", "operator"])
    const admin = await requireUser(request)
    const { id } = await params
    const body = await request.json()

    if (body.rate !== undefined) {
      const rate = parseFloat(body.rate)
      if (isNaN(rate) || rate < 0 || rate > 100) {
        return NextResponse.json({ error: "Commission rate must be between 0 and 100" }, { status: 400 })
      }
      await db.$client.execute(
        "UPDATE affiliates SET rate = ? WHERE id = ?",
        [rate.toFixed(2), id]
      )
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
