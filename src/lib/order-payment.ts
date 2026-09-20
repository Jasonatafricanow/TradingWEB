import type { PaymentProviderType } from "@/services/payment/payment-service"

export interface RepayableOrderState {
  status?: string | null
  payment_status?: string | null
  financial_status?: string | null
  payment_method?: string | null
}

function normalize(value?: string | null): string {
  return value?.trim().toLowerCase() || ""
}

export function getRepaymentProvider(order: RepayableOrderState): PaymentProviderType | null {
  const paymentMethod = normalize(order.payment_method)
  if (!paymentMethod) return "paypal"
  if (paymentMethod === "paypal" || paymentMethod === "stripe") return paymentMethod
  return null
}

export function canRepayOrder(order: RepayableOrderState): boolean {
  return (
    normalize(order.status) === "pending" &&
    normalize(order.payment_status) !== "paid" &&
    normalize(order.financial_status) !== "paid" &&
    getRepaymentProvider(order) !== null
  )
}

export function canCancelPendingOrder(order: RepayableOrderState): boolean {
  return normalize(order.status) === "pending" && normalize(order.payment_status) !== "paid"
}
