import { NextRequest, NextResponse } from "next/server"
import { DEFAULT_CURRENCY } from "@/config/currency"
import { detectCurrencyFromHeaders } from "@/services/geo-currency-service"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const detected = await detectCurrencyFromHeaders(request.headers)
    return NextResponse.json({ data: detected })
  } catch {
    return NextResponse.json({
      data: { currency: DEFAULT_CURRENCY, countryCode: null, source: "fallback" },
    })
  }
}
