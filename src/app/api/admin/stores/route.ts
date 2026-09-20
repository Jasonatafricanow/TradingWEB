import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { listStores, createStore, updateStore } from "@/services/admin/store-service"

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const result = await listStores()
    return NextResponse.json(result)
  } catch (err) { return errorResponse(err) }
}

export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const body = await request.json()
    if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 })
    const data = await createStore(body)
    return NextResponse.json({ data })
  } catch (err) { return errorResponse(err) }
}

export async function PUT(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const body = await request.json()
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 })
    const data = await updateStore(body.id, body)
    return NextResponse.json({ data })
  } catch (err) { return errorResponse(err) }
}
