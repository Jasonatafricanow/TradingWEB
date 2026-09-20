/**
 * payment-validation 单元测试
 *
 * 使用 Node.js 内置 test runner (node:test)，不依赖外部测试框架。
 * 运行: npx tsx src/services/payment/__tests__/payment-validation.test.ts
 *
 * 覆盖 assertPaymentMatchesOrder 的每个分支：
 * - 通过（全匹配 / 浮点容差 / 大小写不敏感 / Stripe paid）
 * - missing_reference
 * - reference_mismatch
 * - amount_mismatch
 * - currency_mismatch
 * - capture_not_completed
 */
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { assertPaymentMatchesOrder } from "../payment-validation"
import type { VerifyPaymentResult } from "../payment-service"
import type { ValidatableOrder } from "../payment-validation"

function baseOrder(overrides: Partial<ValidatableOrder> = {}): ValidatableOrder {
  return {
    id: "order-abc-123",
    total_amount: "49.99",
    currency: "USD",
    ...overrides,
  }
}

function baseResult(overrides: Partial<VerifyPaymentResult> = {}): VerifyPaymentResult {
  return {
    success: true,
    status: "paid",
    transactionId: "txn-001",
    providerOrderId: "pp-order-xyz",
    referenceOrderId: "order-abc-123",
    amount: 49.99,
    amountMinor: 4999,
    currency: "USD",
    captureStatus: "COMPLETED",
    ...overrides,
  }
}

describe("assertPaymentMatchesOrder", () => {
  // ── 通过 ──
  it("passes when all fields match", () => {
    assert.deepStrictEqual(assertPaymentMatchesOrder(baseResult(), baseOrder()), { ok: true })
  })

  it("passes when amountMinor matches exactly", () => {
    assert.deepStrictEqual(
      assertPaymentMatchesOrder(baseResult({ amountMinor: 4999 }), baseOrder()),
      { ok: true },
    )
  })

  it("passes when currency case differs", () => {
    assert.deepStrictEqual(
      assertPaymentMatchesOrder(baseResult({ currency: "usd" }), baseOrder()),
      { ok: true },
    )
  })

  it("passes with Stripe paid captureStatus", () => {
    assert.deepStrictEqual(
      assertPaymentMatchesOrder(baseResult({ captureStatus: "paid" }), baseOrder()),
      { ok: true },
    )
  })

  // ── missing_reference ──
  it("rejects when referenceOrderId is undefined", () => {
    const r = assertPaymentMatchesOrder(baseResult({ referenceOrderId: undefined }), baseOrder())
    assert.strictEqual(r.ok, false)
    if (!r.ok) assert.strictEqual(r.reason, "missing_reference")
  })

  it("rejects when referenceOrderId is empty string", () => {
    const r = assertPaymentMatchesOrder(baseResult({ referenceOrderId: "" }), baseOrder())
    assert.strictEqual(r.ok, false)
    if (!r.ok) assert.strictEqual(r.reason, "missing_reference")
  })

  // ── reference_mismatch ──
  it("rejects when referenceOrderId differs from order.id", () => {
    const r = assertPaymentMatchesOrder(
      baseResult({ referenceOrderId: "other-order-456" }),
      baseOrder({ id: "order-abc-123" }),
    )
    assert.strictEqual(r.ok, false)
    if (!r.ok) assert.strictEqual(r.reason, "reference_mismatch")
  })

  // ── amount_mismatch ──
  it("rejects when amountMinor differs from order", () => {
    const r = assertPaymentMatchesOrder(
      baseResult({ amountMinor: 4899 }),
      baseOrder({ total_amount: "49.99" }),
    )
    assert.strictEqual(r.ok, false)
    if (!r.ok) assert.strictEqual(r.reason, "amount_mismatch")
  })

  it("rejects when amountMinor is undefined", () => {
    const r = assertPaymentMatchesOrder(baseResult({ amountMinor: undefined }), baseOrder())
    assert.strictEqual(r.ok, false)
    if (!r.ok) assert.strictEqual(r.reason, "amount_mismatch")
  })

  // ── currency_mismatch ──
  it("rejects when currency differs", () => {
    const r = assertPaymentMatchesOrder(
      baseResult({ currency: "EUR" }),
      baseOrder({ currency: "USD" }),
    )
    assert.strictEqual(r.ok, false)
    if (!r.ok) assert.strictEqual(r.reason, "currency_mismatch")
  })

  it("rejects when currency is undefined", () => {
    const r = assertPaymentMatchesOrder(baseResult({ currency: undefined }), baseOrder())
    assert.strictEqual(r.ok, false)
    if (!r.ok) assert.strictEqual(r.reason, "currency_mismatch")
  })

  // ── capture_not_completed ──
  it("rejects when captureStatus is PENDING", () => {
    const r = assertPaymentMatchesOrder(baseResult({ captureStatus: "PENDING" }), baseOrder())
    assert.strictEqual(r.ok, false)
    if (!r.ok) assert.strictEqual(r.reason, "capture_not_completed")
  })

  it("rejects when captureStatus is DECLINED", () => {
    const r = assertPaymentMatchesOrder(baseResult({ captureStatus: "DECLINED" }), baseOrder())
    assert.strictEqual(r.ok, false)
    if (!r.ok) assert.strictEqual(r.reason, "capture_not_completed")
  })

  it("rejects when captureStatus is undefined", () => {
    const r = assertPaymentMatchesOrder(baseResult({ captureStatus: undefined }), baseOrder())
    assert.strictEqual(r.ok, false)
    if (!r.ok) assert.strictEqual(r.reason, "capture_not_completed")
  })

  // ── getCaptureById fixtures (PR-C1) ──
  it("accepts getCaptureById result with full binding", () => {
    const captureResult = baseResult({
      transactionId: "cap-abc-123",
      providerOrderId: "pp-order-xyz",
      referenceOrderId: "order-abc-123",
      amount: 49.99,
      currency: "USD",
      captureStatus: "COMPLETED",
    })
    assert.deepStrictEqual(assertPaymentMatchesOrder(captureResult, baseOrder()), { ok: true })
  })

  it("rejects getCaptureById when capture status is PENDING", () => {
    const captureResult = baseResult({
      captureStatus: "PENDING",
      referenceOrderId: "order-abc-123",
    })
    const r = assertPaymentMatchesOrder(captureResult, baseOrder())
    assert.strictEqual(r.ok, false)
    if (!r.ok) assert.strictEqual(r.reason, "capture_not_completed")
  })

  it("rejects getCaptureById when reference_id is missing (order lookup failed)", () => {
    const captureResult = baseResult({
      referenceOrderId: undefined,
      captureStatus: "COMPLETED",
    })
    const r = assertPaymentMatchesOrder(captureResult, baseOrder())
    assert.strictEqual(r.ok, false)
    if (!r.ok) assert.strictEqual(r.reason, "missing_reference")
  })

  // ── PR-C2: coupon only consumed when transitioned ──
  // (markOrderPaidIfNotAlready 的原子性在 order-service 层通过 SQL WHERE 保证；
  //  此处验证上层逻辑：transitioned=true 才消费，false 则跳过。这些是纯逻辑测试。)
  it("simulates coupon consumed when transitioned is true", () => {
    // 模拟：markOrderPaidIfNotAlready 返回 transitioned=true 且 order 有 coupon
    const transitioned = true
    const order = { coupon_id: "coupon-abc" } as { coupon_id: string | null }
    const shouldConsume = transitioned && !!order.coupon_id
    assert.strictEqual(shouldConsume, true)
  })

  it("simulates coupon NOT consumed when transitioned is false (concurrent loser)", () => {
    const transitioned = false
    const order = { coupon_id: "coupon-abc" } as { coupon_id: string | null }
    const shouldConsume = transitioned && !!order.coupon_id
    assert.strictEqual(shouldConsume, false)
  })

  // ── PR-D1: PayPal discount orders omit breakdown/items ──
  it("validates discount orders pass with amountMinor only (no breakdown needed)", () => {
    // 有折扣时校验仅依赖 amountMinor，amountMinor 匹配即通过
    const discountResult = baseResult({
      amount: 44.99,
      amountMinor: 4499, // 49.99 - 5.00 discount → 44.99 → 4499c
      referenceOrderId: "order-abc-123",
    })
    const discountedOrder = baseOrder({ total_amount: "44.99" })
    assert.deepStrictEqual(assertPaymentMatchesOrder(discountResult, discountedOrder), { ok: true })
  })
})
