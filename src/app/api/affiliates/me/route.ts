// GET /api/affiliates/me — 获取我的推广信息
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/services/auth/auth-middleware"
import { getMyAffiliate } from "@/services/affiliate/affiliate-service"

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const data = await getMyAffiliate(user.id)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
