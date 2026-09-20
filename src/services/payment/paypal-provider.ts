/**
 * PayPal 支付提供者
 */
import { Buffer } from "buffer"
import type { VerifyPaymentResult } from "./payment-service"

interface PaymentItem {
  name: string
  description?: string
  quantity: number
  unitPrice: number
  currency: string
}

export interface CreatePaymentParams {
  orderId: string
  items: PaymentItem[]
  totalAmount: number
  currency: string
  returnUrl: string
  cancelUrl: string
  /** 折扣金额（主币种单位）。有折扣时 PayPal payload 会省略 breakdown/items 避免金额不一致 */
  discountAmount?: number
}

export interface PaymentResult {
  success: boolean
  paymentId: string
  approvalUrl?: string
  status: "created" | "approved" | "completed" | "failed"
  message?: string
}

export interface RefundResult {
  success: boolean
  refundId?: string
  message?: string
}

export class PayPalProvider {
  name = "PayPal"
  private clientId: string
  private clientSecret: string
  private baseUrl: string

  /** 独立获取 PayPal access token，供 webhook 等外部模块使用 */
  static async fetchAccessToken(clientId: string, clientSecret: string, sandbox = true): Promise<string> {
    const baseUrl = sandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    const data = await res.json();
    return data.access_token;
  }

  constructor(clientId: string, clientSecret: string, sandbox: boolean) {
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.baseUrl = sandbox
      ? "https://api-m.sandbox.paypal.com"
      : "https://api-m.paypal.com"
  }

  private async getAccessToken(): Promise<string> {
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")
    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    })
    const data = await res.json()
    return data.access_token
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    try {
      const accessToken = await this.getAccessToken()
      const discountAmount = params.discountAmount ?? 0;
      const itemSum = params.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

      // PayPal 要求 amount.value === item_total + shipping - discount（精确到分），否则 CREATE 返回 422。
      // 运费未单独传入，用总额反推：shipping = total - itemSum + discount。
      const shippingAmount = Math.max(0, Number((params.totalAmount - itemSum + discountAmount).toFixed(2)));
      // 只有 breakdown 能精确配平时才带 breakdown/items，否则仅发 amount.value 兜底，避免金额不一致被拒。
      const breakdownTotal = Number((itemSum + shippingAmount - discountAmount).toFixed(2));
      const breakdownBalances = Math.abs(breakdownTotal - params.totalAmount) < 0.005;

      const amountBlock: Record<string, unknown> = {
        currency_code: params.currency,
        value: params.totalAmount.toFixed(2),
      };
      if (breakdownBalances) {
        const breakdown: Record<string, unknown> = {
          item_total: { currency_code: params.currency, value: itemSum.toFixed(2) },
        };
        if (shippingAmount > 0) {
          breakdown.shipping = { currency_code: params.currency, value: shippingAmount.toFixed(2) };
        }
        if (discountAmount > 0) {
          breakdown.discount = { currency_code: params.currency, value: discountAmount.toFixed(2) };
        }
        amountBlock.breakdown = breakdown;
      }

      const purchaseUnit: Record<string, unknown> = {
        reference_id: params.orderId,
        amount: amountBlock,
      };
      if (breakdownBalances) {
        purchaseUnit.items = params.items.map((item) => ({
          name: item.name,
          description: item.description || "",
          quantity: item.quantity.toString(),
          unit_amount: {
            currency_code: item.currency,
            value: item.unitPrice.toFixed(2),
          },
        }));
      }

      const orderPayload = {
        intent: "CAPTURE",
        purchase_units: [purchaseUnit],
        application_context: {
          return_url: params.returnUrl,
          cancel_url: params.cancelUrl,
          brand_name: "GlobalTrade Hub",
          user_action: "PAY_NOW",
        },
      }

      const res = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderPayload),
      })

      const data = await res.json()
      if (data.id) {
        const approvalLink = data.links?.find(
          (link: { rel: string; href: string }) => link.rel === "approve"
        )
        return {
          success: true,
          paymentId: data.id,
          approvalUrl: approvalLink?.href,
          status: "created",
        }
      }
      return {
        success: false,
        paymentId: "",
        status: "failed",
        message: data.message || "PayPal payment creation failed",
      }
    } catch (err) {
      return {
        success: false,
        paymentId: "",
        status: "failed",
        message: err instanceof Error ? (err as Error).message : "Unknown PayPal error",
      }
    }
  }

  async verifyPayment(paymentId: string): Promise<VerifyPaymentResult> {
    try {
      const accessToken = await this.getAccessToken()
      const res = await fetch(`${this.baseUrl}/v2/checkout/orders/${paymentId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json()

      const statusMap: Record<string, VerifyPaymentResult["status"]> = {
        COMPLETED: "paid",
        APPROVED: "pending",
        CREATED: "pending",
        SAVED: "pending",
        VOIDED: "failed",
      }

      const pu = data.purchase_units?.[0];
      const capture = pu?.payments?.captures?.[0];

      return {
        success: data.status === "COMPLETED",
        status: statusMap[data.status] || "failed",
        transactionId: capture?.id,
        providerOrderId: data.id,
        referenceOrderId: pu?.reference_id,
        amount: pu?.amount?.value ? Number(pu.amount.value) : undefined,
        amountMinor: pu?.amount?.value ? Math.round(Number(pu.amount.value) * 100) : undefined,
        currency: pu?.amount?.currency_code,
        captureStatus: capture?.status,
      }
    } catch (err) {
      return {
        success: false,
        status: "failed",
        message: err instanceof Error ? (err as Error).message : "Unknown error",
      }
    }
  }

  async capturePayment(paymentId: string): Promise<VerifyPaymentResult> {
    try {
      const accessToken = await this.getAccessToken()
      const res = await fetch(`${this.baseUrl}/v2/checkout/orders/${paymentId}/capture`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      })
      const data = await res.json()
      const pu = data.purchase_units?.[0];
      const capture = pu?.payments?.captures?.[0];

      return {
        success: data.status === "COMPLETED",
        status: data.status === "COMPLETED" ? "paid" : "failed",
        transactionId: capture?.id,
        providerOrderId: data.id,
        referenceOrderId: pu?.reference_id,
        amount: capture?.amount?.value ? Number(capture.amount.value) : (pu?.amount?.value ? Number(pu.amount.value) : undefined),
        amountMinor: capture?.amount?.value ? Math.round(Number(capture.amount.value) * 100) : (pu?.amount?.value ? Math.round(Number(pu.amount.value) * 100) : undefined),
        currency: capture?.amount?.currency_code || pu?.amount?.currency_code,
        captureStatus: capture?.status || data.status,
        message: data.message,
      }
    } catch (err) {
      return {
        success: false,
        status: "failed",
        message: err instanceof Error ? err.message : "Unknown PayPal capture error",
      }
    }
  }

  /**
   * 通过 capture ID 查询支付结果 — webhook PAYMENT.CAPTURE.COMPLETED 专用。
   *
   * PayPal webhook 的 resource.id 是 capture ID（如 2VU66195TY0963332），
   * 不是订单 ID。需要先查 capture → 拿 related_ids.order_id → 回查 order 取 reference_id。
   */
  async getCaptureById(captureId: string): Promise<VerifyPaymentResult> {
    try {
      const accessToken = await this.getAccessToken();

      // 1. 查询 capture
      const capRes = await fetch(`${this.baseUrl}/v2/payments/captures/${captureId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const capture = await capRes.json();

      // 2. 从 capture 拿到 PayPal order ID
      const paypalOrderId: string | undefined =
        capture.supplementary_data?.related_ids?.order_id;

      // 3. 回查 order 拿 reference_id（我们的 order.id）
      let referenceOrderId: string | undefined;
      if (paypalOrderId) {
        try {
          const orderRes = await fetch(`${this.baseUrl}/v2/checkout/orders/${paypalOrderId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const orderData = await orderRes.json();
          referenceOrderId = orderData.purchase_units?.[0]?.reference_id;
        } catch {
          // reference_id 缺失时 upstream 校验会报 missing_reference
        }
      }

      return {
        success: capture.status === "COMPLETED",
        status: capture.status === "COMPLETED" ? "paid" : "failed",
        transactionId: capture.id,
        providerOrderId: paypalOrderId,
        referenceOrderId,
        amount: capture.amount?.value ? Number(capture.amount.value) : undefined,
        amountMinor: capture.amount?.value ? Math.round(Number(capture.amount.value) * 100) : undefined,
        currency: capture.amount?.currency_code,
        captureStatus: capture.status,
      }
    } catch (err) {
      return {
        success: false,
        status: "failed",
        message: err instanceof Error ? err.message : "Unknown PayPal capture lookup error",
      }
    }
  }

  async refund(params: { paymentId: string; amount: number; reason?: string }): Promise<RefundResult> {
    try {
      const accessToken = await this.getAccessToken()
      const res = await fetch(
        `${this.baseUrl}/v2/payments/captures/${params.paymentId}/refund`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: { value: params.amount.toFixed(2), currency_code: "USD" },
            note_to_payer: params.reason || "Refund",
          }),
        }
      )
      const data = await res.json()
      return {
        success: data.status === "COMPLETED",
        refundId: data.id,
        message: data.status === "COMPLETED" ? "Refund processed" : "Refund failed",
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? (err as Error).message : "Unknown error",
      }
    }
  }
}
