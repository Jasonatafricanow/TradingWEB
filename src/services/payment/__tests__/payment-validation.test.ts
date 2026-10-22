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

  // Provider lookup and coupon consumption need production integration coverage;
  // locally reconstructed result objects and boolean expressions cannot prove them.

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
