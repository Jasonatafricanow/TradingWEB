import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { 
  getTransfer, 
  approveTransfer, 
  completeTransfer, 
  cancelTransfer,
  TransferServiceError,
} from "@/services/admin/transfer-service"

function transferErrorResponse(error: unknown) {
  if (error instanceof TransferServiceError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status })
  }
  return errorResponse(error)
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin", "manager", "operator"])
    const { id } = await params
    const data = await getTransfer(id)
    if (!data) {
      return NextResponse.json({ error: "调拨记录不存在" }, { status: 404 })
    }
    return NextResponse.json({ data })
  } catch (err) { return transferErrorResponse(err) }
}

// PUT → 审批（pending → in_transit）
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin", "manager"])
    const user = await requireUser(request)
    const { id } = await params
    await approveTransfer(id, user.id)
    return NextResponse.json({ data: { id, status: "in_transit" } })
  } catch (err) { return transferErrorResponse(err) }
}

// PATCH → 完成或取消
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin", "manager"])
    const user = await requireUser(request)
    const { id } = await params
    const body = await request.json()

    if (!body.action) {
      return NextResponse.json({ error: "Missing action field (complete/cancel)" }, { status: 400 })
    }

    switch (body.action) {
      case "complete":
        await completeTransfer(id, user.id)
        return NextResponse.json({ data: { id, status: "completed" } })
      case "cancel":
        await cancelTransfer(id, user.id)
        return NextResponse.json({ data: { id, status: "cancelled" } })
      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 })
    }
  } catch (err) {
    return transferErrorResponse(err)
  }
}
