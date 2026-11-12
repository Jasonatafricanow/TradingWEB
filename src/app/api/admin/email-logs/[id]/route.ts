import { db } from "@/lib/db";
import { API_MESSAGES } from "@/lib/api-messages";
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
    const [rows] = await db.$client.execute("SELECT recipient, subject, body FROM email_logs WHERE id = ? LIMIT 1", [id]);
    const original = (rows as Array<{ recipient: string; subject: string; body: string }>)[0];
    if (!original) return NextResponse.json({ error: API_MESSAGES.emailLogNotFound }, { status: 404 });
    const result = await sendEmail(original.recipient, original.subject, original.body)

    

    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}
