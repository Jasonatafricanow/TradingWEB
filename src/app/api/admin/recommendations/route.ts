import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { setManualRecommendation, removeRecommendation, getManualRecommendations } from "@/services/recommendation-service"

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const productId = request.nextUrl.searchParams.get("product_id")
    if (!productId) return NextResponse.json({ error: "product_id is required" }, { status: 400 })
    const result = await getManualRecommendations(productId)
    return NextResponse.json(result)
  } catch (err) { return errorResponse(err) }
}

export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const body = await request.json()
    if (!body.product_id || !body.recommended_product_id) {
      return NextResponse.json({ error: "product_id and recommended_product_id are required" }, { status: 400 })
    }
    const data = await setManualRecommendation(body.product_id, body.recommended_product_id, body.sort_order || 0)
    return NextResponse.json({ data })
  } catch (err) { return errorResponse(err) }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })
    await removeRecommendation(id)
    return NextResponse.json({ success: true })
  } catch (err) { return errorResponse(err) }
}
