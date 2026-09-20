import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { listTiers, updateTier, getUserMembership } from "@/services/admin/membership-service"

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
