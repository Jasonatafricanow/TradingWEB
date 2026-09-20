import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { listShipments, createShipment } from "@/services/admin/shipment-service"

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const result = await listShipments()
    return NextResponse.json(result)
  } catch (err) { return errorResponse(err) }
}

export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const body = await request.json()
    if (!body.order_id) return NextResponse.json({ error: "order_id is required" }, { status: 400 })
    const data = await createShipment(body)
    return NextResponse.json({ data })
  } catch (err) { return errorResponse(err) }
}
