import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { cancelUnpaidOrder } from "@/services/orders/order-service";

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
    // One transaction per order so each cancellation also returns its wallet share.
    const [rows] = await db.$client.execute(
      `SELECT id FROM orders
       WHERE payment_method NOT IN ('paypal', 'stripe', 'wallet')
         AND payment_status = 'unpaid'
         AND status = 'pending'
         AND created_at < DATE_SUB(NOW(), INTERVAL 72 HOUR)
       LIMIT 1000`
    );
    let cancelled = 0;
    for (const { id } of rows as Array<{ id: string }>) {
      if (await cancelUnpaidOrder(id, "offline payment not received within 72 hours")) cancelled += 1;
    }

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
