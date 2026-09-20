import { NextRequest, NextResponse } from "next/server";
import { getPaymentProvider, type PaymentProviderType } from "@/services/payment/payment-service";
import type { PayPalProvider } from "@/services/payment/paypal-provider";
import type { StripeProvider } from "@/services/payment/stripe-provider";
import { getOrder, markOrderPaidIfNotAlready } from "@/services/orders/order-service";
import { assertPaymentMatchesOrder } from "@/services/payment/payment-validation";

function redirect(path: string, base: string) {
  return NextResponse.redirect(new URL(path, process.env.NEXT_PUBLIC_SITE_URL || base));
}

/**
 * GET /api/payment/callback — 支付成功后 PayPal/Stripe 重定向回本站
 *
 * ⚠️ 回调请求不带 Authorization header（由 PayPal/Stripe 发起重定向），
 *    因此不调用 requireUser。订单归属通过 provider 返回的 reference_id
 *    与 order.id 比对来验证。
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider") as PaymentProviderType | null;
    const orderId = searchParams.get("order_id");
    const paymentId = searchParams.get("token") || searchParams.get("paymentId") || searchParams.get("session_id");

    if (!provider || !orderId) {
      return redirect("/orders?payment=error", request.url);
    }

    // 查询订单（不校验 user_id，因为回调无 auth header）
    const order = await getOrder(orderId);
    if (!order) {
      return redirect(`/orders?payment=error&reason=not_found&order_id=${orderId}`, request.url);
    }

    // 幂等：已支付直接跳成功
    if (order.payment_status === "paid") {
      return redirect(`/orders?payment=success&order_id=${orderId}`, request.url);
    }

    // ── PayPal ──
    if (provider === "paypal" && paymentId) {
      const clientId = process.env.PAYPAL_CLIENT_ID;
      const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
      if (clientId && clientSecret) {
        const pp = getPaymentProvider("paypal", { clientId, clientSecret, sandbox: process.env.PAYPAL_SANDBOX !== "false" }) as PayPalProvider | null;
        if (pp) {
          // 先尝试 capture；如果已 captured（重试/浏览器刷新），用 verifyPayment 确认
          let result = await pp.capturePayment(paymentId);
          if (result.captureStatus !== "COMPLETED" && result.status !== "paid") {
            result = await pp.verifyPayment(paymentId);
          }

          const check = assertPaymentMatchesOrder(result, {
            id: order.id,
            total_amount: order.total_amount,
            currency: order.currency,
            payment_status: order.payment_status,
          });

          if (!check.ok) {
            console.warn("[callback] PayPal mismatch:", check.reason, check.detail, { orderId, paymentId });
            return redirect(`/orders?payment=error&reason=${check.reason}&order_id=${orderId}`, request.url);
          }

          // 原子翻转：并发 callback/webhook 只有第一个成功
          const { transitioned, order: updated } = await markOrderPaidIfNotAlready(orderId, {
            payment_id: result.transactionId || paymentId,
          });

          // 仅首次 paid 执行副作用:核销优惠券、扣库存、写时间线
          if (transitioned && updated) {
            const { runOrderPaidSideEffects } = await import("@/services/orders/order-paid-effects");
            await runOrderPaidSideEffects(updated, { source: "paypal_callback" });
          }

          return redirect(`/orders?payment=success&order_id=${orderId}`, request.url);
        }
      }
    }

    // ── Stripe ──
    if (provider === "stripe" && paymentId) {
      const publicKey = process.env.STRIPE_PUBLIC_KEY;
      const secretKey = process.env.STRIPE_SECRET_KEY;
      if (publicKey && secretKey) {
        const sp = getPaymentProvider("stripe", { publicKey, secretKey, sandbox: process.env.STRIPE_SANDBOX !== "false" }) as StripeProvider | null;
        if (sp) {
          const result = await sp.verifyPayment(paymentId);

          const check = assertPaymentMatchesOrder(result, {
            id: order.id,
            total_amount: order.total_amount,
            currency: order.currency,
            payment_status: order.payment_status,
          });

          if (!check.ok) {
            console.warn("[callback] Stripe mismatch:", check.reason, check.detail, { orderId, paymentId });
            return redirect(`/orders?payment=error&reason=${check.reason}&order_id=${orderId}`, request.url);
          }

          // 原子翻转：并发 callback/webhook 只有第一个成功
          const { transitioned, order: updated } = await markOrderPaidIfNotAlready(orderId, {
            payment_id: paymentId,
          });

          // 仅首次 paid 执行副作用:核销优惠券、扣库存、写时间线
          if (transitioned && updated) {
            const { runOrderPaidSideEffects } = await import("@/services/orders/order-paid-effects");
            await runOrderPaidSideEffects(updated, { source: "stripe_callback" });
          }

          return redirect(`/orders?payment=success&order_id=${orderId}`, request.url);
        }
      }
    }

    return redirect(`/orders?payment=error&order_id=${orderId}`, request.url);
  } catch (err) {
    console.error("[callback] unhandled error:", err);
    return redirect("/orders?payment=error", request.url);
  }
}
