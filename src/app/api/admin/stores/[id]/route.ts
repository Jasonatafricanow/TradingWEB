import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { getStore, updateStore, deleteStore } from "@/services/admin/store-service"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const { id } = await params
    const result = await getStore(id)
    if (!result.data) return NextResponse.json({ error: "store not found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (err) { return errorResponse(err) }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const { id } = await params
    const body = await request.json()
    const data = await updateStore(id, body)
    return NextResponse.json({ data })
  } catch (err) { return errorResponse(err) }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const { id } = await params
    const data = await deleteStore(id)
    return NextResponse.json({ data })
  } catch (err) { return errorResponse(err) }
}
