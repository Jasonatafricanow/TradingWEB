import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { listInventory, stockIn, stockOut, adjustStock } from "@/services/admin/inventory-service"

// GET /api/admin/inventory
export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    await requireUser(request)
    const searchParams = request.nextUrl.searchParams
    const result = await listInventory({
      productId: searchParams.get("product_id") || undefined,
      variantId: searchParams.has("variant_id") ? searchParams.get("variant_id") : undefined,
      storeId: searchParams.has("store_id") ? searchParams.get("store_id") : undefined,
      warehouseId: searchParams.has("warehouse_id") ? searchParams.get("warehouse_id") : undefined,
    })
    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}

// POST /api/admin/inventory — 入库/出库/调整
export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const user = await requireUser(request)
    const body = await request.json()
    const { action, product_id, variant_id, store_id, warehouse_id, quantity, note } = body as {
      action: "in" | "out" | "adjust"
      product_id: string
      variant_id?: string | null
      store_id?: string | null
      warehouse_id?: string | null
      quantity: number
      note?: string
    }

    if (!product_id || quantity === undefined) {
      return NextResponse.json({ error: "product_id and quantity are required" }, { status: 400 })
    }

    const target = {
      productId: product_id,
      variantId: variant_id || null,
      storeId: store_id || null,
      warehouseId: warehouse_id || null,
    }

    let result
    switch (action) {
      case "in":
        result = await stockIn(target, quantity, note, user.id)
        break
      case "out":
        result = await stockOut(target, quantity, note, user.id)
        break
      case "adjust":
        result = await adjustStock(target, quantity, note, user.id)
        break
      default:
        return NextResponse.json({ error: "action must be 'in', 'out', or 'adjust'" }, { status: 400 })
    }

    return NextResponse.json({ data: result })
  } catch (err) {
    if (err instanceof Error && (err as Error).message === "库存不足") {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return errorResponse(err)
  }
}
