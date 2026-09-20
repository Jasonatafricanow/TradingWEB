import { NextRequest, NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/services/auth/auth-middleware";
import { getPaymentProvider, type PaymentProviderType } from "@/services/payment/payment-service";
import { getOrderForPayment, markOrderPaidIfNotAlready } from "@/services/orders/order-service";
import { runOrderPaidSideEffects } from "@/services/orders/order-paid-effects";
import { IS_DEMO_MODE } from "@/config/constants";

/**
 * POST /api/payment/create — 创建支付
 */
export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireUser(request);
  } catch(e) { return errorResponse(e); }
  try {
    const body = await request.json();
    const { provider, orderId } = body as {
      provider: PaymentProviderType;
      orderId: string;
    };

    if (!provider || !orderId) {
      return NextResponse.json({ error: "provider and orderId are required" }, { status: 400 });
    }
    if (provider !== "paypal" && provider !== "stripe") {
      return NextResponse.json({ error: "Unsupported payment provider" }, { status: 400 });
    }

    const order = await getOrderForPayment(orderId, user.id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.status !== "pending" || order.payment_status === "paid") {
      return NextResponse.json({ error: "Order is not payable" }, { status: 409 });
    }

    const currency = order.currency || "USD";
    const totalAmount = Number(order.total_amount);
    const items = (order.order_items || []).map((item) => ({
      name: item.product_title,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      currency,
    }));

    const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
    const domain = process.env.NEXT_PUBLIC_SITE_URL || vercelUrl || request.nextUrl.origin;

    if (provider === "paypal") {
      const clientId = process.env.PAYPAL_CLIENT_ID;
      const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

      if (clientId && clientSecret) {
        const paypalProvider = getPaymentProvider("paypal", { clientId, clientSecret, sandbox: process.env.PAYPAL_SANDBOX !== "false" });
        if (paypalProvider) {
          const result = await paypalProvider.createPayment({
            orderId, items, totalAmount, currency,
            discountAmount: Number(order.discount_amount || 0),
            returnUrl: `${domain}/api/payment/callback?provider=paypal&order_id=${orderId}`,
            cancelUrl: `${domain}/checkout?cancelled=true`,
          });
          return NextResponse.json({ data: result });
        }
      }
    } else if (provider === "stripe") {
      const publicKey = process.env.STRIPE_PUBLIC_KEY;
      const secretKey = process.env.STRIPE_SECRET_KEY;

      if (publicKey && secretKey) {
        const stripeProvider = getPaymentProvider("stripe", { publicKey, secretKey, sandbox: process.env.STRIPE_SANDBOX !== "false" });
        if (stripeProvider) {
          const result = await stripeProvider.createPayment({
            orderId, items, totalAmount, currency,
            returnUrl: `${domain}/api/payment/callback?provider=stripe&order_id=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
            cancelUrl: `${domain}/checkout?cancelled=true`,
          });
          return NextResponse.json({ data: result });
        }
      }
    }

    if (!IS_DEMO_MODE || process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: `${provider} payment is not configured` },
        { status: 503 }
      );
    }

    const mockPaymentId = `mock_${provider}_${Date.now()}`;
    const { transitioned, order: updatedOrder } = await markOrderPaidIfNotAlready(orderId, {
      payment_id: mockPaymentId,
      financial_status: "paid",
    });
    if (transitioned && updatedOrder) {
      await runOrderPaidSideEffects(updatedOrder, { source: "mock_payment" });
    }

    return NextResponse.json({
      data: {
        success: true,
        paymentId: mockPaymentId,
        approvalUrl: `${domain}/checkout/success?mock=1&order_id=${orderId}`,
        status: "completed",
        message: `Mock payment for ${provider}. Configure credentials to enable real payments.`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? (err as Error).message : "Unknown payment error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
