import { NextResponse } from "next/server"
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { listAbandonedCarts, triggerAbandonedCartCheck } from "@/services/notifications/abandoned-cart-service"

// GET /api/admin/abandoned-carts?page=&pageSize=&search=&recovered=
export async function GET(request: Request) {
  try {
    await requireStaffRole(request, ["admin", "operator", "support"])
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim();
    const recoveredParam = url.searchParams.get("recovered");
    const result = await listAbandonedCarts({
      page: Number(url.searchParams.get("page")) || 1,
      pageSize: Number(url.searchParams.get("pageSize")) || 50,
      search: search || undefined,
      recovered: recoveredParam === "true" ? true : recoveredParam === "false" ? false : undefined,
    })
    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    await requireStaffRole(request, ["admin", "operator"])
    const results = await triggerAbandonedCartCheck()
    return NextResponse.json({ processed: results.processed, results })
  } catch (err) {
    return errorResponse(err)
  }
}
