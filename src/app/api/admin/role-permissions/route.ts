import { NextRequest, NextResponse } from "next/server"
import { requireStaffRole, requireUser, errorResponse } from "@/services/auth/auth-middleware"
import { GRANTABLE_SECTIONS } from "@/lib/admin-sections"
import { loadManagerGrant, saveManagerGrant } from "@/services/admin/role-permissions-service"
import { API_MESSAGES } from "@/lib/api-messages"

// GET /api/admin/role-permissions — manager grant (admin only, never grantable)
export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin"])
    const manager = await loadManagerGrant()
    return NextResponse.json({ data: { manager, sections: GRANTABLE_SECTIONS } })
  } catch (err) {
    return errorResponse(err)
  }
}

// PUT /api/admin/role-permissions — { manager: { all, sections } }
export async function PUT(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin"])
    const user = await requireUser(request)
    const body = await request.json().catch(() => null) as { manager?: { all?: unknown; sections?: unknown } } | null
    if (!body?.manager || typeof body.manager !== "object" || (body.manager.sections !== undefined && !Array.isArray(body.manager.sections))) {
      return NextResponse.json({ error: API_MESSAGES.invalidRolePermissions }, { status: 400 })
    }
    const manager = await saveManagerGrant(body.manager, user.id)
    return NextResponse.json({ data: { manager } })
  } catch (err) {
    return errorResponse(err)
  }
}
