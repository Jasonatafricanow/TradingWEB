import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { getShipment, updateShipment, addTrackingEvent } from "@/services/admin/shipment-service"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const { id } = await params
    const result = await getShipment(id)
    if (!result.data) return NextResponse.json({ error: "shipment not found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (err) { return errorResponse(err) }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const { id } = await params
    const body = await request.json()
    const data = await updateShipment(id, body)
    return NextResponse.json({ data })
  } catch (err) { return errorResponse(err) }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    if (body.action === 'tracking_event') {
      const data = await addTrackingEvent(id, body.event)
      return NextResponse.json({ data })
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 })
  } catch (err) { return errorResponse(err) }
}
