import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { listCoupons, createCoupon, updateCoupon, deleteCoupon } from "@/services/admin/coupon-service"

// GET /api/admin/coupons?page=&pageSize=&search=&isActive=
export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const params = request.nextUrl.searchParams;
    const search = params.get("search")?.trim();
    const isActiveParam = params.get("isActive");
    const result = await listCoupons({
      page: Number(params.get("page")) || 1,
      pageSize: Number(params.get("pageSize")) || 50,
      search: search || undefined,
      isActive: isActiveParam === "true" ? true : isActiveParam === "false" ? false : undefined,
    })
    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}

// POST /api/admin/coupons
export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const body = await request.json()
    const { code, type, value, min_order_amount, max_discount, usage_limit, expires_at, description } = body

    if (!code || !type || !value) {
      return NextResponse.json({ error: "code, type, and value are required" }, { status: 400 })
    }

    const data = await createCoupon({ code, type, value, min_order_amount, max_discount, usage_limit, expires_at, description })
    return NextResponse.json({ data })
  } catch (err) {
    if (err instanceof Error && (err as Error).message.includes("已存在")) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return errorResponse(err)
  }
}

// PUT /api/admin/coupons
export async function PUT(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const body = await request.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    const data = await updateCoupon(id, updates)
    return NextResponse.json({ data })
  } catch (err) {
    return errorResponse(err)
  }
}

// DELETE /api/admin/coupons
export async function DELETE(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const { id } = await request.json() as { id?: string }
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })
    await deleteCoupon(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return errorResponse(err)
  }
}
