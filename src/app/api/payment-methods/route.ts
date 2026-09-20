import { NextResponse } from "next/server";
import { listPaymentMethods } from "@/services/admin/payment-method-service";

/**
 * GET /api/payment-methods — 公开接口，返回所有启用的收款方式
 * Checkout 页调用，用于渲染线下支付选项。
 */
export async function GET() {
  try {
    const result = await listPaymentMethods({ enabled: true });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ data: [], error: "Failed to load payment methods" }, { status: 500 });
  }
}
