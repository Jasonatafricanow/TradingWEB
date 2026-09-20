import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { createTransfer, getTransfers } from "@/services/admin/transfer-service"

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"])
    const url = new URL(request.url)
    const status = url.searchParams.get("status") || undefined
    const page = parseInt(url.searchParams.get("page") || "1")
    const limit = parseInt(url.searchParams.get("limit") || "50")
    const result = await getTransfers({ status, page, limit })
    return NextResponse.json(result)
  } catch (err) { return errorResponse(err) }
}

export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"])
    const user = await requireUser(request)
    const body = await request.json()

    if (!body.fromWarehouseId || !body.toWarehouseId || !body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: "Missing required fields: fromWarehouseId, toWarehouseId, items" }, { status: 400 })
    }

    for (const item of body.items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        return NextResponse.json({ error: "Each item must have productId and positive quantity" }, { status: 400 })
      }
    }

    const result = await createTransfer({
      fromWarehouseId: body.fromWarehouseId,
      toWarehouseId: body.toWarehouseId,
      shippingMethod: body.shippingMethod,
      packagingInfo: body.packagingInfo,
      items: body.items,
      note: body.note,
      operatorId: user.id,
    })
    return NextResponse.json({ data: result })
  } catch (err) {
    if (err instanceof Error && (err as Error).message.includes("stock insufficient")) {
      return NextResponse.json({ error: (err as Error).message }, { status: 409 })
    }
    return errorResponse(err)
  }
}