import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { searchPosCatalog } from "@/services/admin/pos-service";

// GET /api/admin/pos/catalog?q=&store_id= — POS 商品搜索(名称/SKU)
export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "manager", "operator"]);
    await requireUser(request);
    const q = request.nextUrl.searchParams.get("q") || "";
    const storeId = request.nextUrl.searchParams.get("store_id") || undefined;
    const data = await searchPosCatalog(q, storeId);
    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}
