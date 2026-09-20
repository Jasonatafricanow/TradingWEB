import { NextRequest, NextResponse } from "next/server"
import { getRecommendations } from "@/services/recommendation-service"

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value || "6", 10)
  if (!Number.isFinite(parsed)) return 6
  return Math.min(Math.max(parsed, 1), 12)
}

// GET /api/recommendations?product_id=xxx&limit=6
export async function GET(request: NextRequest) {
  try {
    const productId = request.nextUrl.searchParams.get("product_id")
    const limit = parseLimit(request.nextUrl.searchParams.get("limit"))
    if (!productId) return NextResponse.json({ error: "product_id is required" }, { status: 400 })
    const data = await getRecommendations(productId.trim(), limit)
    return NextResponse.json({ data })
  } catch (err) {
    const msg = err instanceof Error ? (err as Error).message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
