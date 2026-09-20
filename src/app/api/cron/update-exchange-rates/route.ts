import { NextRequest, NextResponse } from "next/server"
import { refreshExchangeRates } from "@/services/exchange-rate-service"

export const dynamic = "force-dynamic"

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret) return false

  const authHeader = request.headers.get("authorization")
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
  const providedSecret =
    request.headers.get("x-cron-secret") ||
    request.nextUrl.searchParams.get("key") ||
    bearer
  return providedSecret === expectedSecret
}

async function handleUpdate(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const snapshot = await refreshExchangeRates()
    return NextResponse.json({ success: true, data: snapshot })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Exchange rate update failed"
    return NextResponse.json({ success: false, error: message }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  return handleUpdate(request)
}

export async function GET(request: NextRequest) {
  return handleUpdate(request)
}
