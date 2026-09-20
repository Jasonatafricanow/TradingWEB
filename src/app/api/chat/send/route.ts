import { NextRequest, NextResponse } from "next/server"
import { requireUser, errorResponse } from "@/services/auth/auth-middleware"
import { sendUserMessage, getConversationHistory, getUserConversations } from "@/services/chat/chat-service"

// POST /api/chat/send — 用户发消息
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const { content, title } = await request.json()
    const normalizedContent = typeof content === "string" ? content.trim().slice(0, 10000) : ""
    const normalizedTitle = typeof title === "string" ? title.trim().slice(0, 200) : undefined
    if (!normalizedContent) return NextResponse.json({ error: "content is required" }, { status: 400 })

    const result = await sendUserMessage({ userId: user.id, content: normalizedContent, title: normalizedTitle })
    return NextResponse.json(result)
  } catch (err) { return errorResponse(err) }
}

// GET /api/chat?conversation_id=xxx — 获取历史消息
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const conversationId = request.nextUrl.searchParams.get("conversation_id")

    if (conversationId) {
      const result = await getConversationHistory(conversationId, user.id)
      return NextResponse.json(result)
    }

    // 无 conversation_id 返回用户对话列表
    const result = await getUserConversations(user.id)
    return NextResponse.json(result)
  } catch (err) { return errorResponse(err) }
}
