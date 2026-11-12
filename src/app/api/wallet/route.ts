import { NextRequest, NextResponse } from "next/server"
import { requireUser, errorResponse } from "@/services/auth/auth-middleware"
import { getWalletSummary } from "@/services/promotions/wallet-service"
import { getProgramSettings } from "@/services/promotions/program-settings"

// GET /api/wallet — 获取钱包余额
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    const [summary, programs] = await Promise.all([getWalletSummary(user.id), getProgramSettings()])
    return NextResponse.json({ data: {
      balance: Number(summary.balance),
      currency: "USD",
      enabled: programs.wallet.enabled,
      credits: summary.credits.map(({ id, amount, remaining, expires_at, status, created_at }) => ({ id, amount, remaining, expires_at, status, created_at })),
      transactions: summary.transactions.map(({ id, type, amount, order_id, created_at }) => ({ id, type, amount, order_id, created_at })),
    } })
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
