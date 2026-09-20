import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/services/auth/auth-middleware"
import { validateCoupon } from "@/services/admin/coupon-service"

// GET /api/coupons/validate?code=XXX&amount=YYY
export async function GET(request: NextRequest) {
  try {
    await requireUser(request)

    const code = request.nextUrl.searchParams.get("code")?.trim()
    const amount = Number(request.nextUrl.searchParams.get("amount") || "0")

    if (!code) {
      return NextResponse.json({ error: "code is required" }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "valid amount is required" }, { status: 400 })
    }

    const result = await validateCoupon(code.slice(0, 100), amount)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? (err as Error).message : "Validation error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
