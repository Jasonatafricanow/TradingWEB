import { NextRequest, NextResponse } from "next/server"
import { API_MESSAGES } from "@/lib/api-messages"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { logAction } from "@/services/admin/audit-service"
import { getClientIp } from "@/lib/rate-limit"
import { EmailResendNotAllowedError, resendEmailLog } from "@/services/notifications/email-service"

// POST /api/admin/email-logs/:id — resend from the stored original.
// The original row is kept; the resend is a new row with retry_of = :id.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin", "operator"])
    const user = await requireUser(request)
    const { id } = await params
    const result = await resendEmailLog(id)
    if (!result) return NextResponse.json({ error: API_MESSAGES.emailLogNotFound }, { status: 404 })
    await logAction({
      userId: user.id,
      action: "email.resend",
      entityType: "email_log",
      entityId: id,
      details: { resend_id: result.id, status: result.status, error: result.error },
      ipAddress: getClientIp(request),
    })
    return NextResponse.json({ data: result })
  } catch (err) {
    if (err instanceof EmailResendNotAllowedError) {
      return NextResponse.json({ error: API_MESSAGES.emailResendNotAllowed }, { status: 409 })
    }
    return errorResponse(err)
  }
}
