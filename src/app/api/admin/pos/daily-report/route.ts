import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireStaffRole, errorResponse, AuthError } from "@/services/auth/auth-middleware";
import { getPosDailyReport } from "@/services/admin/pos-service";

// GET /api/admin/pos/daily-report?store_id=&date=YYYY-MM-DD — 门店日结汇总
export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const user = await requireUser(request);
    const storeId = request.nextUrl.searchParams.get("store_id");
    const date = request.nextUrl.searchParams.get("date");
    if (!storeId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "store_id 和 date(YYYY-MM-DD)必填" }, { status: 400 });
    }
    if (!user.staffId) throw new AuthError("Staff authorization required", 403);
    if (user.role !== "admin") {
      const [rows] = await db.$client.execute("SELECT store_id FROM staff WHERE id = ? AND is_active = TRUE LIMIT 1", [user.staffId]);
      const staff = (rows as Array<{ store_id: string | null }>)[0];
      if (!staff || staff.store_id !== storeId) throw new AuthError("Store access denied", 403);
    }
    const data = await getPosDailyReport(storeId, date);
    data.orders = data.orders.map(order => ({ ...order, buyer_phone: null }));
    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}
