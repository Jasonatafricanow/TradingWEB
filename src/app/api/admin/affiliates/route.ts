// GET /api/admin/affiliates — 推广者列表
// POST /api/admin/affiliates — 手动创建推广者
import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole } from "@/services/auth/auth-middleware"
import { listAffiliates, adminCreateAffiliate } from "@/services/affiliate/affiliate-service"

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    await requireUser(request)
    const result = await listAffiliates()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"])
    const body = await request.json()
    const email = String(body.email || "").trim().toLowerCase()
    const nickname = String(body.nickname || "").trim()
    if (!email || !nickname) {
      return NextResponse.json({ error: "email 和 nickname 是必填项" }, { status: 400 })
    }
    const rate = body.rate !== undefined ? Number(body.rate) : 5
    const data = await adminCreateAffiliate({
      email,
      nickname,
      rate: Number.isFinite(rate) ? rate : 5,
      status: body.status === "pending" ? "pending" : "active",
    })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
