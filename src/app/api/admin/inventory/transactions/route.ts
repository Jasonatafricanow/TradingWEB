import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { listTransactions } from "@/services/admin/inventory-service"

// GET /api/admin/inventory/transactions
export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    await requireUser(request)
    const productId = request.nextUrl.searchParams.get("product_id") || undefined
    const variantId = request.nextUrl.searchParams.has("variant_id")
      ? request.nextUrl.searchParams.get("variant_id")
      : undefined
    const result = await listTransactions(productId, variantId)
    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}
