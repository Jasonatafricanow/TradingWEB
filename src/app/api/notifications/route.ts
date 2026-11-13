import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/services/auth/auth-middleware"
import { getUserNotifications, markAllAsRead, getUnreadCount } from "@/services/notification-service"

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get("unread") === "true"
    const { IS_DEMO_MODE } = await import("@/config/constants")
    if (IS_DEMO_MODE) {
      const { demoStore } = await import("@/lib/demo/commerce")
      const all = demoStore().notifications
      return NextResponse.json({ data: unreadOnly ? all.filter((n) => !n.is_read) : all })
    }
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
    const { IS_DEMO_MODE } = await import("@/config/constants")
    if (IS_DEMO_MODE) {
      const { demoStore } = await import("@/lib/demo/commerce")
      return NextResponse.json({ data: { count: demoStore().notifications.filter((x) => !x.is_read).length } })
    }
    const count = await getUnreadCount(user.id)
    return NextResponse.json({ unread_count: count })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}