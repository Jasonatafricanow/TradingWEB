/**
 * Stripe 支付提供者
 */
import type { VerifyPaymentResult } from "./payment-service"

export class StripeProvider {
  name = "Stripe"
  private publicKey: string
  private secretKey: string
  private baseUrl = "https://api.stripe.com/v1"

  constructor(publicKey: string, secretKey: string, _sandbox: boolean) {
    this.publicKey = publicKey
    this.secretKey = secretKey
  }

  async createPayment(params: {
    orderId: string
    items: Array<{ name: string; description?: string; quantity: number; unitPrice: number; currency: string }>
    totalAmount: number
    currency: string
    returnUrl: string
    cancelUrl: string
  }): Promise<{ success: boolean; paymentId: string; approvalUrl?: string; status: string; message?: string }> {
    try {
      const formData = new URLSearchParams()
      formData.append("mode", "payment")
      formData.append("success_url", params.returnUrl)
      formData.append("cancel_url", params.cancelUrl)
      formData.append("client_reference_id", params.orderId)
      formData.append("payment_method_types[0]", "card")
      formData.append("metadata[order_id]", params.orderId)
      formData.append("payment_intent_data[metadata][order_id]", params.orderId)

      params.items.forEach((item, i) => {
        formData.append(`line_items[${i}][price_data][unit_amount]`, Math.round(item.unitPrice * 100).toString())
        formData.append(`line_items[${i}][price_data][currency]`, item.currency.toLowerCase())
        formData.append(`line_items[${i}][price_data][product_data][name]`, item.name)
        if (item.description) {
          formData.append(`line_items[${i}][price_data][product_data][description]`, item.description)
        }
        formData.append(`line_items[${i}][quantity]`, item.quantity.toString())
      })

      const res = await fetch(`${this.baseUrl}/checkout/sessions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      })

      const data = await res.json()
      if (data.id) {
        return { success: true, paymentId: data.id, approvalUrl: data.url, status: "created" }
      }
      return {
        success: false,
        paymentId: "",
        status: "failed",
        message: data.error?.message || "Stripe payment creation failed",
      }
    } catch (err) {
      return {
        success: false,
        paymentId: "",
        status: "failed",
        message: err instanceof Error ? (err as Error).message : "Unknown Stripe error",
      }
    }
  }

  async verifyPayment(paymentId: string): Promise<VerifyPaymentResult> {
    try {
      const res = await fetch(`${this.baseUrl}/checkout/sessions/${paymentId}`, {
        headers: { Authorization: `Bearer ${this.secretKey}` },
      })
      const data = await res.json()

      const statusMap: Record<string, VerifyPaymentResult["status"]> = {
        complete: "paid",
        open: "pending",
        expired: "failed",
      }

      return {
        success: data.payment_status === "paid",
        status: statusMap[data.status] || "failed",
        transactionId: data.payment_intent,
        providerOrderId: data.id,
        referenceOrderId: data.client_reference_id || data.metadata?.order_id,
        amount: data.amount_total != null ? Number(data.amount_total) / 100 : undefined,
        amountMinor: data.amount_total != null ? data.amount_total : undefined,
        currency: data.currency ? String(data.currency).toUpperCase() : undefined,
        captureStatus: data.payment_status,
      }
    } catch (err) {
      return {
        success: false,
        status: "failed",
        message: err instanceof Error ? (err as Error).message : "Unknown error",
      }
    }
  }

  async refund(params: { paymentId: string; amount: number }): Promise<{ success: boolean; refundId?: string; message?: string }> {
    try {
      // 解析 Payment Intent ID
      let paymentIntentId = params.paymentId
      if (paymentIntentId.startsWith("cs_")) {
        const sessionRes = await fetch(`${this.baseUrl}/checkout/sessions/${paymentIntentId}`, {
          headers: { Authorization: `Bearer ${this.secretKey}` },
        })
        const session = await sessionRes.json()
        paymentIntentId = session.payment_intent
      }
      if (!paymentIntentId) {
        return { success: false, message: "Unable to resolve payment intent ID" }
      }

      const formData = new URLSearchParams()
      formData.append("payment_intent", paymentIntentId)
      formData.append("amount", Math.round(params.amount * 100).toString())

      const res = await fetch(`${this.baseUrl}/refunds`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      })

      const data = await res.json()
      return {
        success: data.status === "succeeded",
        refundId: data.id,
        message: data.status === "succeeded" ? "Refund processed" : "Refund failed",
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? (err as Error).message : "Unknown error",
      }
    }
  }
}
