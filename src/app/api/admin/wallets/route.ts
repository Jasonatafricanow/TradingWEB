import { NextRequest, NextResponse } from "next/server"
import { requireStaffRole, requireUser, errorResponse } from "@/services/auth/auth-middleware"
import { findCustomer } from "@/services/admin/customer-lookup"
import { getWalletSummary, grantWalletCredit, WalletError } from "@/services/promotions/wallet-service"
import { parseMoneyToCents } from "@/services/orders/order-money"
import { optionalDate } from "@/lib/date-input"
import { API_MESSAGES } from "@/lib/api-messages"

// GET /api/admin/wallets?q=<email or user id> — one customer's wallet
export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin"])
    const q = new URL(request.url).searchParams.get("q") || ""
    const customer = await findCustomer(q)
    if (!customer) return NextResponse.json({ error: API_MESSAGES.userNotFound }, { status: 404 })
    return NextResponse.json({ data: { customer, ...(await getWalletSummary(customer.id)) } })
  } catch (err) {
    return errorResponse(err)
  }
}

// POST /api/admin/wallets — grant credit { user_id, amount, expires_at?, note? }
export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin"])
    const user = await requireUser(request)
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const customer = typeof body?.user_id === "string" ? await findCustomer(body.user_id) : null
    if (!customer) return NextResponse.json({ error: API_MESSAGES.userNotFound }, { status: 404 })
    let amountCents: number
    let expiresAt: Date | null | undefined
    try {
      amountCents = parseMoneyToCents(String(body?.amount ?? ""))
      expiresAt = optionalDate(body?.expires_at)
    } catch {
      return NextResponse.json({ error: API_MESSAGES.invalidWalletCredit }, { status: 400 })
    }
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 255) || null : null
    const id = await grantWalletCredit({ userId: customer.id, amountCents, expiresAt: expiresAt ?? null, note, actorId: user.id })
    return NextResponse.json({ data: { id, ...(await getWalletSummary(customer.id)) } }, { status: 201 })
  } catch (err) {
    if (err instanceof WalletError) return NextResponse.json({ error: API_MESSAGES.invalidWalletCredit }, { status: err.status })
    return errorResponse(err)
  }
}
