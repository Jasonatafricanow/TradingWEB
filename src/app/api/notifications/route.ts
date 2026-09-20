import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/services/auth/auth-middleware"
import { getUserNotifications, markAllAsRead, getUnreadCount } from "@/services/notification-service"

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get("unread") === "true"
    const data = await getUserNotifications(user.id, 50, unreadOnly)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser(request)
    await markAllAsRead(user.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const count = await getUnreadCount(user.id)
    return NextResponse.json({ unread_count: count })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}