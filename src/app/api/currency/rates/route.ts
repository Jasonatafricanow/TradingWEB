import { NextResponse } from "next/server"
import { getEffectiveExchangeRates } from "@/services/exchange-rate-service"

export const dynamic = "force-dynamic"

export async function GET() {
  const snapshot = await getEffectiveExchangeRates()
  return NextResponse.json({ data: snapshot })
}
