import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { restock } from "@/services/admin/warehouse-service"

export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const user = await requireUser(request)
    const body = await request.json()
    const { supplierId, productId, quantity, note } = body
    
    if (!supplierId) return NextResponse.json({ error: "supplierId is required" }, { status: 400 })
    if (!productId) return NextResponse.json({ error: "productId is required" }, { status: 400 })
    if (!quantity || quantity < 1) return NextResponse.json({ error: "quantity must be >= 1" }, { status: 400 })
    
    const result = await restock({
      supplierId,
      productId,
      quantity,
      note,
      operatorId: user.staffId || user.id,
    })
    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}
