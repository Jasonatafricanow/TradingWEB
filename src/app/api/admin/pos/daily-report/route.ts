import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { getPosDailyReport } from "@/services/admin/pos-service";

// GET /api/admin/pos/daily-report?store_id=&date=YYYY-MM-DD — 门店日结汇总
export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "manager", "operator"]);
    await requireUser(request);
    const storeId = request.nextUrl.searchParams.get("store_id");
    const date = request.nextUrl.searchParams.get("date");
    if (!storeId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "store_id 和 date(YYYY-MM-DD)必填" }, { status: 400 });
    }
    const data = await getPosDailyReport(storeId, date);
    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}
