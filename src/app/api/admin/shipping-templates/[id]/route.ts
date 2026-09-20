import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole } from "@/services/auth/auth-middleware"
import { getShippingTemplate, updateShippingTemplate, deleteShippingTemplate } from "@/services/admin/shipping-template-service"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    await requireUser(request)
    const { id } = await params
    const data = await getShippingTemplate(id)
    if (!data) return NextResponse.json({ error: "Template not found" }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    await requireUser(request)
    const { id } = await params
    const body = await request.json()
    const data = await updateShippingTemplate(id, body)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    await requireUser(request)
    const { id } = await params
    await deleteShippingTemplate(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}