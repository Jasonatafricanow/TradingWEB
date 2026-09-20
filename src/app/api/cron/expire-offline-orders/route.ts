import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * 验证 cron 请求来源 — 与 daily-briefing 共用 CRON_SECRET。
 */
function isAuthorizedCronRequest(request: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) return false;
  const providedSecret =
    request.headers.get("x-cron-secret") ||
    request.nextUrl.searchParams.get("key");
  return providedSecret === expectedSecret;
}

/**
 * POST /api/cron/expire-offline-orders
 *
 * 72 小时内未付款的线下订单（COD / 银行转账等）自动取消。
 * 建议每小时触发一次（Vercel cron 或外部调度器）。
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [result] = await db.$client.execute(
      `UPDATE orders
       SET status = 'cancelled', updated_at = NOW()
       WHERE payment_method NOT IN ('paypal', 'stripe')
         AND payment_status = 'unpaid'
         AND status = 'pending'
         AND created_at < DATE_SUB(NOW(), INTERVAL 72 HOUR)`
    );

    const cancelled = (result as { affectedRows?: number }).affectedRows ?? 0;

    return NextResponse.json({
      success: true,
      cancelled,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET 同样支持（便于浏览器调试 + ?key= 传参） */
export async function GET(request: NextRequest) {
  return POST(request);
}
