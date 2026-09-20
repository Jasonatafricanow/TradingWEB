import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { listRefunds, getRefund, createRefund, processRefund, confirmReturn } from "@/services/admin/refund-service"

// GET /api/admin/refunds?page=&pageSize=&status=&search=
export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const params = request.nextUrl.searchParams;
    const search = params.get("search")?.trim();
    const status = params.get("status")?.trim();
    const result = await listRefunds({
      page: Number(params.get("page")) || 1,
      pageSize: Number(params.get("pageSize")) || 50,
      search: search || undefined,
      status: status || undefined,
    })
    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}

// POST /api/admin/refunds — 创建退款申请
export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const body = await request.json()
    const { order_id, reason, amount, order_item_id, evidence } = body
    if (!order_id || !reason || !amount) {
      return NextResponse.json({ error: "order_id, reason, and amount are required" }, { status: 400 })
    }
    const data = await createRefund({ order_id, reason, amount, evidence })
    return NextResponse.json({ data })
  } catch (err) {
    return errorResponse(err)
  }
}

// PUT /api/admin/refunds — 审批/处理
export async function PUT(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const user = await requireUser(request)
    const body = await request.json()
    const { id, action, admin_note } = body as {
      id: string
      action: "approved" | "rejected" | "returned"
      admin_note?: string
    }

    if (!id || !action) {
      return NextResponse.json({ error: "id and action are required" }, { status: 400 })
    }

    let data
    if (action === "returned") {
      // 确认退货 → 加库存 → 完成
      data = await confirmReturn(id, user.id)
    } else {
      data = await processRefund(id, action, admin_note, user.id)
    }
    return NextResponse.json({ data })
  } catch (err) {
    return errorResponse(err)
  }
}
