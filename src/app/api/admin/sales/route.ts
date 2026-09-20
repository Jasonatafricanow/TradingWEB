import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { getSalesSummary, getProductSalesRank, getRevenueTrend, getChannelBreakdown, exportSalesCsv } from "@/services/admin/sales-service"

const CSV_UTF8_BOM = String.fromCharCode(0xfeff)

// GET /api/admin/sales
export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    await requireUser(request)
    const parsedDays = parseInt(request.nextUrl.searchParams.get("days") || "30", 10)
    const days = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.min(parsedDays, 365) : 30
    const format = request.nextUrl.searchParams.get("format")

    // CSV export: raw CSV text body (BOM prefix so Excel detects UTF-8)
    if (format === "csv") {
      const csv = await exportSalesCsv(days)
      return new NextResponse(CSV_UTF8_BOM + csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="sales_rank_${days}d.csv"`,
        },
      })
    }

    const [summary, productRanks, revenueTrend, channelBreakdown] = await Promise.all([
      getSalesSummary(days),
      getProductSalesRank(days),
      getRevenueTrend(days),
      getChannelBreakdown(days),
    ])

    return NextResponse.json({
      data: { summary, productRanks, revenueTrend, channelBreakdown },
    })
  } catch (err) {
    return errorResponse(err)
  }
}
