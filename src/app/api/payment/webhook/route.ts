import { NextRequest, NextResponse } from "next/server";
import type { PaymentProviderType } from "@/services/payment/payment-service";
import type { PayPalProvider as PayPalProviderType } from "@/services/payment/paypal-provider";
import { getOrder, updateOrder, markOrderPaidIfNotAlready } from "@/services/orders/order-service";
import { assertPaymentMatchesOrder } from "@/services/payment/payment-validation";

// ── Stripe SDK (用于 constructEvent 签名验证) ──
import Stripe from "stripe";

/**
 * Unsigned webhooks are only for local callback debugging. Public staging and
 * production environments must use provider signatures.
 */
export function allowUnsignedWebhookDebug(requestUrl: string): boolean {
  if (process.env.ALLOW_UNSIGNED_WEBHOOKS !== "true") return false;

  try {
    const hostname = new URL(requestUrl).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

/**
 * 验证 Stripe webhook 签名。
 * 使用 STRIPE_WEBHOOK_SECRET；WEBHOOK_SECRET 可作为自托管共享密钥 fallback。
 */
async function verifyStripeSignature(
  rawBody: string,
  signature: string | null,
  requestUrl: string,
): Promise<{ valid: false; error: string; status: number } | { valid: true; event: Stripe.Event }> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;

  if (!webhookSecret) {
    if (allowUnsignedWebhookDebug(requestUrl)) {
      console.warn("[webhook] Stripe signature not configured — accepting unsigned localhost debug webhook");
      return { valid: true, event: JSON.parse(rawBody) as Stripe.Event };
    }
    return { valid: false, error: "STRIPE_WEBHOOK_SECRET not configured", status: 503 };
  }

  if (!signature) {
    return { valid: false, error: "Missing stripe-signature header", status: 400 };
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_dummy");
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    return { valid: true, event };
  } catch (err) {
    console.warn("[webhook] Stripe signature invalid:", (err as Error).message);
    return { valid: false, error: "Invalid Stripe signature", status: 400 };
  }
}

/**
 * 验证 PayPal webhook 签名。
 * 使用 PAYPAL_WEBHOOK_ID + verify-webhook-signature API。
 */
async function verifyPayPalSignature(
  rawBody: string,
  headers: Headers,
  requestUrl: string,
): Promise<{ valid: false; error: string; status: number } | { valid: true }> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;

  if (!webhookId) {
    if (allowUnsignedWebhookDebug(requestUrl)) {
      console.warn("[webhook] PayPal webhook ID not configured — accepting unsigned localhost debug webhook");
      return { valid: true };
    }
    return { valid: false, error: "PAYPAL_WEBHOOK_ID not configured", status: 503 };
  }

  const transmissionId = headers.get("paypal-transmission-id");
  const transmissionTime = headers.get("paypal-transmission-time");
  const certUrl = headers.get("paypal-cert-url");
  const authAlgo = headers.get("paypal-auth-algo");
  const transmissionSig = headers.get("paypal-transmission-sig");

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return { valid: false, error: "Missing PayPal signature headers", status: 400 };
  }

  try {
    const sandbox = process.env.PAYPAL_SANDBOX !== "false";
    const baseUrl = sandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return { valid: false, error: "PayPal credentials not configured for signature verification", status: 503 };
    }

    const { PayPalProvider } = await import("@/services/payment/paypal-provider");
    const accessToken = await PayPalProvider.fetchAccessToken(clientId, clientSecret, sandbox);

    const verifyRes = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: JSON.parse(rawBody),
      }),
    });

    const verify = await verifyRes.json();
    if (verify.verification_status === "SUCCESS") {
      return { valid: true };
    }
    console.warn("[webhook] PayPal signature verification failed:", verify.verification_status);
    return { valid: false, error: "Invalid PayPal signature", status: 400 };
  } catch (err) {
    console.error("[webhook] PayPal signature verification error:", err);
    return { valid: false, error: "PayPal signature verification failed", status: 500 };
  }
}

/**
 * POST /api/payment/webhook — 异步支付通知
 *
 * Stripe: 使用 stripe-signature header + STRIPE_WEBHOOK_SECRET HMAC 验证。
 * PayPal: 使用 5 个 PayPal header + PAYPAL_WEBHOOK_ID + verify-webhook-signature API 验证。
 *
 * 生产环境缺失签名密钥时返回 503。
 * 只有 ALLOW_UNSIGNED_WEBHOOKS=true 且请求目标为 localhost 时才接受无签名调试请求。
 */
export async function POST(request: NextRequest) {
  let rawBody: string;
  try { rawBody = await request.text(); } catch {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }

  let provider = request.headers.get("x-payment-provider") as PaymentProviderType | null;
  if (!provider) {
    try {
      const url = new URL(request.url);
      provider = url.searchParams.get("provider") as PaymentProviderType | null;
    } catch {
      // ignore URL parse errors
    }
  }
  if (!provider) {
    if (request.headers.has("paypal-transmission-id") || request.headers.has("paypal-transmission-sig")) {
      provider = "paypal";
    } else if (request.headers.has("stripe-signature")) {
      provider = "stripe";
    }
  }

  // ── Stripe signature verification ──
  if (provider === "stripe") {
    const sigResult = await verifyStripeSignature(rawBody, request.headers.get("stripe-signature"), request.url);
    if (!sigResult.valid) {
      return NextResponse.json({ error: sigResult.error }, { status: sigResult.status });
    }

    const body = sigResult.event;
    const eventType = body.type;
    const data = (body.data?.object as unknown as Record<string, unknown> | undefined) ?? {};

    if (eventType === "checkout.session.completed") {
      const orderId = data?.client_reference_id as string | undefined;
      if (!orderId) return NextResponse.json({ received: true });

      const order = await getOrder(orderId);
      if (!order) return NextResponse.json({ received: true });
      if (order.payment_status === "paid") {
        return NextResponse.json({ received: true, orderId, alreadyPaid: true });
      }

      const { getPaymentProvider } = await import("@/services/payment/payment-service");
      const publicKey = process.env.STRIPE_PUBLIC_KEY;
      const secretKey = process.env.STRIPE_SECRET_KEY;
      if (publicKey && secretKey) {
        const sp = getPaymentProvider("stripe", { publicKey, secretKey, sandbox: process.env.STRIPE_SANDBOX !== "false" });
        if (sp) {
          const paymentId = data.id as string;
          const result = await sp.verifyPayment(paymentId);
          const check = assertPaymentMatchesOrder(result, {
            id: order.id, total_amount: order.total_amount, currency: order.currency, payment_status: order.payment_status,
          });
          if (!check.ok) {
            console.warn("[webhook] Stripe mismatch:", check.reason, check.detail, { orderId, paymentId });
            return NextResponse.json({ received: true, mismatch: check.reason });
          }
          const { transitioned, order: updated } = await markOrderPaidIfNotAlready(orderId, { payment_id: paymentId });
          if (transitioned && updated) {
            const { runOrderPaidSideEffects } = await import("@/services/orders/order-paid-effects");
            await runOrderPaidSideEffects(updated, { source: "stripe_webhook" });
          }
          return NextResponse.json({ received: true, orderId });
        }
      }
    }

    if (eventType === "charge.refunded") {
      const meta = data.metadata as Record<string, unknown> | undefined;
      const orderId = meta?.order_id as string | undefined;
      if (orderId) await updateOrder(orderId, { status: "refunded", financial_status: "refunded", payment_status: "refunded" });
      return NextResponse.json({ received: true, orderId });
    }

    return NextResponse.json({ received: true });
  }

  // ── PayPal signature verification ──
  if (provider === "paypal") {
    const sigResult = await verifyPayPalSignature(rawBody, request.headers, request.url);
    if (!sigResult.valid) {
      return NextResponse.json({ error: sigResult.error }, { status: sigResult.status });
    }

    const body = JSON.parse(rawBody);
    const eventType = body.event_type;
    const resource = body.resource;

    if (eventType === "CHECKOUT.ORDER.APPROVED") {
      console.log("[webhook] PayPal CHECKOUT.ORDER.APPROVED (not marking paid)");
      return NextResponse.json({ received: true });
    }

    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      const orderId = resource?.purchase_units?.[0]?.reference_id;
      if (!orderId) return NextResponse.json({ received: true });

      const order = await getOrder(orderId);
      if (!order) return NextResponse.json({ received: true });
      if (order.payment_status === "paid") {
        return NextResponse.json({ received: true, orderId, alreadyPaid: true });
      }

      const { getPaymentProvider } = await import("@/services/payment/payment-service");
      const clientId = process.env.PAYPAL_CLIENT_ID;
      const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
      if (clientId && clientSecret) {
        const pp = getPaymentProvider("paypal", { clientId, clientSecret, sandbox: process.env.PAYPAL_SANDBOX !== "false" }) as PayPalProviderType | null;
        if (pp) {
          const captureId = resource.id;
          const result = await pp.getCaptureById(captureId);
          const check = assertPaymentMatchesOrder(result, {
            id: order.id, total_amount: order.total_amount, currency: order.currency, payment_status: order.payment_status,
          });
          if (!check.ok) {
            console.warn("[webhook] PayPal mismatch:", check.reason, check.detail, { orderId, captureId });
            return NextResponse.json({ received: true, mismatch: check.reason });
          }
          const { transitioned, order: updated } = await markOrderPaidIfNotAlready(orderId, { payment_id: result.transactionId || captureId });
          if (transitioned && updated) {
            const { runOrderPaidSideEffects } = await import("@/services/orders/order-paid-effects");
            await runOrderPaidSideEffects(updated, { source: "paypal_webhook" });
          }
          return NextResponse.json({ received: true, orderId });
        }
      }
    }

    return NextResponse.json({ received: true });
  }

  // 无 provider 或未知 provider
  return NextResponse.json({ error: "Missing or unsupported x-payment-provider header" }, { status: 400 });
}
