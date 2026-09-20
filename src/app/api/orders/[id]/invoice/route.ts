import { NextRequest, NextResponse } from "next/server"
import { requireUser, errorResponse } from "@/services/auth/auth-middleware"
import { generateInvoiceHtml } from "@/services/invoice-service"
import { getOrder } from "@/services/orders/order-service"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await requireUser(request)
    const order = await getOrder(id)

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }
    if (order.user_id !== user.id && !user.staffId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const html = await generateInvoiceHtml(id)
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="invoice_${id.slice(0, 8)}.html"`,
      },
    })
  } catch (err) {
    return errorResponse(err)
  }
}
