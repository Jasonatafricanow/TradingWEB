import { NextRequest, NextResponse } from "next/server"
import { requireStaffRole, requireUser, errorResponse } from "@/services/auth/auth-middleware"
import { getProgramSettings, updateProgramSettings, ProgramSettingsError } from "@/services/promotions/program-settings"
import { API_MESSAGES } from "@/lib/api-messages"

// GET /api/admin/promotions — membership / wallet / affiliate program switches
export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin"])
    return NextResponse.json({ data: await getProgramSettings() })
  } catch (err) {
    return errorResponse(err)
  }
}

// PUT /api/admin/promotions — partial update, audited
export async function PUT(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin"])
    const user = await requireUser(request)
    const body = await request.json().catch(() => null)
    const data = await updateProgramSettings(body, user.id)
    return NextResponse.json({ data })
  } catch (err) {
    if (err instanceof ProgramSettingsError) {
      return NextResponse.json({ error: API_MESSAGES.invalidProgramSettings, field: err.field }, { status: 400 })
    }
    return errorResponse(err)
  }
}
