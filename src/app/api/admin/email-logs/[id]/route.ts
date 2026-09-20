import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"

import { sendEmail } from "@/services/notifications/email-service"

// POST /api/admin/email-logs/:id/retry — 重试发送
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    await requireUser(request)
    const { id } = await params
    const result = await sendEmail(
      id, "Retry", "Retry body")

    

    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}
