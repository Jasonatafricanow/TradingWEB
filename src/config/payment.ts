/**
 * 支付配置
 */
export interface PaymentProvider {
  id: string
  name: string
  nameZh: string
  enabled: boolean
  sandboxMode: boolean
  envKeyClientId: string
  envKeySecret: string
}

export const PAYMENT_PROVIDERS: PaymentProvider[] = [
  {
    id: "paypal",
    name: "PayPal",
    nameZh: "PayPal",
    enabled: !!process.env.PAYPAL_CLIENT_ID,
    sandboxMode: process.env.PAYPAL_SANDBOX !== "false",
    envKeyClientId: "PAYPAL_CLIENT_ID",
    envKeySecret: "PAYPAL_CLIENT_SECRET",
  },
  {
    id: "stripe",
    name: "Stripe",
    nameZh: "Stripe (Visa)",
    enabled: !!process.env.STRIPE_SECRET_KEY,
    sandboxMode: process.env.STRIPE_SANDBOX !== "false",
    envKeyClientId: "STRIPE_PUBLISHABLE_KEY",
    envKeySecret: "STRIPE_SECRET_KEY",
  },
]

export const DEFAULT_PAYMENT_METHOD = "paypal"
