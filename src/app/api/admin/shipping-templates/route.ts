import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole } from "@/services/auth/auth-middleware"
import { listShippingTemplates, createShippingTemplate } from "@/services/admin/shipping-template-service"

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    await requireUser(request)
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get("active") === "true"
    const data = await listShippingTemplates(activeOnly)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    await requireUser(request)
    const body = await request.json()
    const data = await createShippingTemplate(body)
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}