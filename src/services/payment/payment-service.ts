/**
 * 支付服务 — 统一支付入口
 *
 * 封装 PayPal / Stripe 提供者的创建、验证、退款
 */
import { PayPalProvider } from "./paypal-provider"
import { StripeProvider } from "./stripe-provider"

export type PaymentProviderType = "paypal" | "stripe"

export interface PaymentItem {
  name: string
  description?: string
  quantity: number
  unitPrice: number
  currency: string
}

export interface PaymentConfig {
  clientId?: string
  clientSecret?: string
  publicKey?: string
  secretKey?: string
  sandbox?: boolean
}

export function getPaymentProvider(type: PaymentProviderType, config: PaymentConfig) {
  switch (type) {
    case "paypal":
      if (!config.clientId || !config.clientSecret) return null
      return new PayPalProvider(config.clientId, config.clientSecret, config.sandbox ?? true)
    case "stripe":
      if (!config.publicKey || !config.secretKey) return null
      return new StripeProvider(config.publicKey, config.secretKey, config.sandbox ?? true)
    default:
      return null
  }
}

export { PayPalProvider } from "./paypal-provider"
export { StripeProvider } from "./stripe-provider"
export type { PaymentResult, RefundResult, CreatePaymentParams } from "./paypal-provider"

/** 统一支付验证返回结构（callback / webhook 共用） */
export interface VerifyPaymentResult {
  success: boolean
  status: "paid" | "pending" | "failed" | "refunded"
  transactionId?: string
  /** PayPal order.id 或 Stripe session.id */
  providerOrderId?: string
  /** PayPal purchase_units[0].reference_id 或 Stripe client_reference_id / metadata.order_id */
  referenceOrderId?: string
  /** 支付金额（主币种单位，如美元），用于日志/UI */
  amount?: number
  /** 最小单位整数（cents），用于精确比对。Stripe: amount_total; PayPal: Math.round(value*100) */
  amountMinor?: number
  /** 币种代码（大写，如 USD） */
  currency?: string
  /** PayPal captures[0].status 或 Stripe payment_status */
  captureStatus?: string
  message?: string
}
