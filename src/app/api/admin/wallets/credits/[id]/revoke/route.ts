import { NextRequest, NextResponse } from "next/server"
import { requireStaffRole, requireUser, errorResponse } from "@/services/auth/auth-middleware"
import { revokeWalletCredit, WalletError } from "@/services/promotions/wallet-service"
import { API_MESSAGES } from "@/lib/api-messages"

// POST /api/admin/wallets/credits/[id]/revoke — takes back the unspent part
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffRole(request, ["admin"])
    const user = await requireUser(request)
    const { id } = await params
    const body = await request.json().catch(() => ({})) as { note?: unknown }
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 255) || null : null
    return NextResponse.json({ data: await revokeWalletCredit(id, user.id, note) })
  } catch (err) {
    if (err instanceof WalletError && err.status === 404) {
      return NextResponse.json({ error: API_MESSAGES.walletCreditNotFound }, { status: 404 })
    }
    return errorResponse(err)
  }
}
