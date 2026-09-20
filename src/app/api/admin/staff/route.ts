import { NextRequest, NextResponse } from "next/server"
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { listStaff, createStaff } from "@/services/admin/staff-service"

const ALLOWED_ROLES = new Set(["admin", "operator", "support"])

// GET /api/admin/staff
export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ['admin']);
    const result = await listStaff()
    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}

// POST /api/admin/staff
export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ['admin']);
    const body = await request.json()
    const { name, email, role, phone } = body
    const normalizedName = typeof name === "string" ? name.trim().slice(0, 100) : ""
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase().slice(0, 255) : ""
    const normalizedPhone = typeof phone === "string" ? phone.trim().slice(0, 50) : undefined
    const normalizedRole = typeof role === "string" && ALLOWED_ROLES.has(role) ? role : "support"

    if (!normalizedName || !normalizedEmail || !normalizedEmail.includes("@")) {
      return NextResponse.json({ error: "name and email are required" }, { status: 400 })
    }

    const data = await createStaff({
      name: normalizedName,
      email: normalizedEmail,
      role: normalizedRole,
      phone: normalizedPhone,
    })
    return NextResponse.json({ data })
  } catch (err) {
    if (err instanceof Error && (err as Error).message.includes("已被注册")) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return errorResponse(err)
  }
}
