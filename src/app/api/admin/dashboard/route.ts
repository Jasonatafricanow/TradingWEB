import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { getDashboardStats } from "@/services/admin/dashboard-service";

export async function GET(request: Request) {
  try {
    await requireStaffRole(request, ["admin", "operator", "support"]);
    await requireUser(request);
    const { IS_DEMO_MODE } = await import("@/config/constants");
    if (IS_DEMO_MODE) {
      const m = await import("@/lib/demo/commerce");
      return NextResponse.json({ data: {
        ...m.demoDashboardStats(),
        revenueChart: m.demoRevenueSeries(30),
        recentOrders: m.demoListOrders().slice(0, 8),
        topProducts: m.demoTopProducts(6),
        orderStatusDist: m.demoOrderStatusDistribution(),
        categoryDist: m.demoCategoryDistribution(),
        paymentDist: m.demoPaymentDistribution(),
      } });
    }
    const stats = await getDashboardStats();
    return NextResponse.json({ data: stats });
  } catch (err) {
    return errorResponse(err);
  }
}
