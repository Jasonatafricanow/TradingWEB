import { NextRequest, NextResponse } from "next/server"
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { seedDemoData, clearDemoData } from "@/services/admin/seed-service"

// POST /api/admin/seed — 生成演示数据
export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin"]);
    const result = await seedDemoData()
    return NextResponse.json({ data: result })
  } catch (err) { return errorResponse(err) }
}

// DELETE /api/admin/seed — 一键清除演示数据
export async function DELETE(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin"]);
    const confirmation = request.headers.get("x-confirm-action") || request.nextUrl.searchParams.get("confirm")
    if (confirmation !== "clear-demo-data") {
      return NextResponse.json(
        { error: "Confirmation required: x-confirm-action=clear-demo-data" },
        { status: 400 }
      )
    }
    const result = await clearDemoData()
    return NextResponse.json(result)
  } catch (err) { return errorResponse(err) }
}
