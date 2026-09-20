import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/services/auth/auth-middleware"
import { markAsRead } from "@/services/notification-service"

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request)
    const { id } = await params
    await markAsRead(id, user.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
