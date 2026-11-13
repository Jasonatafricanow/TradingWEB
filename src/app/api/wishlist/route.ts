import { NextRequest, NextResponse } from "next/server"
import { requireUser, errorResponse } from "@/services/auth/auth-middleware"
import { getWishlist, addToWishlist, removeFromWishlist } from "@/services/wishlist-service"

// GET /api/wishlist — 获取心愿单
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    const { IS_DEMO_MODE } = await import("@/config/constants")
    if (IS_DEMO_MODE) {
      const { demoStore } = await import("@/lib/demo/commerce")
      const { demoProduct } = await import("@/lib/demo/catalog")
      const items = demoStore().wishlist.map((id) => demoProduct(id)).filter(Boolean)
      return NextResponse.json({ data: items })
    }
    const result = await getWishlist(user.id)
    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}

// POST /api/wishlist — 添加收藏
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const { product_id } = await request.json()
    if (!product_id) return NextResponse.json({ error: "product_id is required" }, { status: 400 })
    const { IS_DEMO_MODE } = await import("@/config/constants")
    if (IS_DEMO_MODE) {
      const { demoStore } = await import("@/lib/demo/commerce")
      const s = demoStore()
      if (!s.wishlist.includes(product_id)) s.wishlist.push(product_id)
      return NextResponse.json({ data: { product_id, added: true } })
    }
    const result = await addToWishlist(user.id, product_id)
    return NextResponse.json({ data: result })
  } catch (err) {
    return errorResponse(err)
  }
}

// DELETE /api/wishlist — 取消收藏
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser(request)
    const { product_id } = await request.json()
    if (!product_id) return NextResponse.json({ error: "product_id is required" }, { status: 400 })
    await removeFromWishlist(user.id, product_id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return errorResponse(err)
  }
}
