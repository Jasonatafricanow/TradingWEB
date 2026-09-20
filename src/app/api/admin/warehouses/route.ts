import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { listWarehouses, createWarehouse, updateWarehouse } from "@/services/admin/warehouse-service"

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const result = await listWarehouses()
    return NextResponse.json(result)
  } catch (err) { return errorResponse(err) }
}

export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const body = await request.json()
    if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 })
    const data = await createWarehouse(body)
    return NextResponse.json({ data })
  } catch (err) { return errorResponse(err) }
}

export async function PUT(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const body = await request.json()
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 })
    const data = await updateWarehouse(body.id, body)
    return NextResponse.json({ data })
  } catch (err) { return errorResponse(err) }
}
