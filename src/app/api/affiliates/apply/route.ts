// POST /api/affiliates/apply — 提交推广申请
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/services/auth/auth-middleware"
import { applyAffiliate } from "@/services/affiliate/affiliate-service"

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const { nickname } = await request.json()
    const normalizedNickname = typeof nickname === "string" ? nickname.trim().slice(0, 100) : ""
    if (!normalizedNickname) return NextResponse.json({ error: "nickname is required" }, { status: 400 })
    const data = await applyAffiliate(user.id, normalizedNickname)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
