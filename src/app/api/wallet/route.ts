import { NextRequest, NextResponse } from "next/server"
import { requireUser, errorResponse } from "@/services/auth/auth-middleware"
import { getUserWallet } from "@/services/admin/membership-service"

// GET /api/wallet — 获取钱包余额
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    const wallet = await getUserWallet(user.id)
    return NextResponse.json({ data: wallet })
  } catch (err) {
    return errorResponse(err)
  }
}

// POST /api/wallet/topup — 充值/存入余额
export async function POST(request: NextRequest) {
  try {
    await requireUser(request)
    return NextResponse.json(
      { error: "Wallet top-up must be completed through a verified payment flow" },
      { status: 403 }
    )
  } catch (err) {
    return errorResponse(err)
  }
}
