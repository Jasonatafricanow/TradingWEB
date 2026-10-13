import { NextRequest, NextResponse } from "next/server"
import { refreshExchangeRates } from "@/services/exchange-rate-service"
import { isAuthorizedCronRequest } from "@/lib/cron-auth"

export const dynamic = "force-dynamic"

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
