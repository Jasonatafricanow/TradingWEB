/**
 * 支付校验器 — callback / webhook 共用
 *
 * 用于验证从 PayPal/Stripe 返回的支付结果是否与订单匹配，
 * 防止支付会话篡改（用一个支付会话标记另一个订单）。
 */
import type { VerifyPaymentResult } from "./payment-service"

/** 可被校验的订单最小字段集 */
export interface ValidatableOrder {
  id: string
  total_amount: string | number
  currency: string
  payment_status?: string | null
}

export type PaymentMismatchReason =
  | "missing_reference"
  | "reference_mismatch"
  | "amount_mismatch"
  | "currency_mismatch"
  | "capture_not_completed"

export interface PaymentMismatch {
  ok: false
  reason: PaymentMismatchReason
  detail: string
}

export interface PaymentMatch {
  ok: true
}

/**
 * 校验 provider 返回的支付结果是否与订单一致。
 *
 * 规则：
 * 1. provider 必须返回 referenceOrderId（reference_id / client_reference_id）
 * 2. referenceOrderId 必须等于 order.id
 * 3. 金额差 ≤0.01（容忍浮点舍入）
 * 4. 币种大小写不敏感匹配
 * 5. captureStatus 必须是 COMPLETED (PayPal) 或 paid (Stripe)
 */
export function assertPaymentMatchesOrder(
  result: VerifyPaymentResult,
  order: ValidatableOrder,
): PaymentMatch | PaymentMismatch {
  // 1. 必须有 reference
  if (!result.referenceOrderId) {
    return {
      ok: false,
      reason: "missing_reference",
      detail: "provider returned no reference_id / client_reference_id",
    }
  }

  // 2. reference 必须匹配订单 ID
  if (result.referenceOrderId !== order.id) {
    return {
      ok: false,
      reason: "reference_mismatch",
      detail: `provider_ref=${result.referenceOrderId} order_id=${order.id}`,
    }
  }

  // 3. 金额必须一致（整数分精确比对）
  if (result.amountMinor === undefined) {
    return {
      ok: false,
      reason: "amount_mismatch",
      detail: "provider returned no amountMinor",
    }
  }
  const expectMinor = Math.round(Number(order.total_amount) * 100)
  if (result.amountMinor !== expectMinor) {
    return {
      ok: false,
      reason: "amount_mismatch",
      detail: `provider=${result.amountMinor}c order=${expectMinor}c`,
    }
  }

  // 4. 币种必须一致（大小写不敏感）
  const expectCur = order.currency.toUpperCase()
  const actualCur = (result.currency || "").toUpperCase()
  if (!actualCur || actualCur !== expectCur) {
    return {
      ok: false,
      reason: "currency_mismatch",
      detail: `provider=${actualCur || "(empty)"} order=${expectCur}`,
    }
  }

  // 5. capture 必须已完成
  const captureOk =
    result.captureStatus === "COMPLETED" || result.captureStatus === "paid"
  if (!captureOk) {
    return {
      ok: false,
      reason: "capture_not_completed",
      detail: result.captureStatus || "(empty)",
    }
  }

  return { ok: true }
}
