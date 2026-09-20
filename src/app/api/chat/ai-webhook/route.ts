import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const aiKey = process.env.AI_API_KEY
    if (!aiKey) {
      return NextResponse.json({ error: "AI webhook is not configured" }, { status: 503 })
    }

    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${aiKey}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { conversation_id, content, metadata } = body

    if (
      typeof conversation_id !== "string" ||
      !conversation_id.trim() ||
      typeof content !== "string" ||
      !content.trim()
    ) {
      return NextResponse.json({ error: "conversation_id and content are required" }, { status: 400 })
    }

    const { aiReply } = await import("@/services/chat/chat-service")
    const result = await aiReply({
      conversation_id: conversation_id.trim(),
      content: content.trim().slice(0, 10000),
      metadata,
    })
    return NextResponse.json({ data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
