import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { canCancelPendingOrder, canRepayOrder, getRepaymentProvider } from "../order-payment"

describe("order payment actions", () => {
  it("allows pending unpaid PayPal orders to be paid again", () => {
    const order = {
      status: "pending",
      payment_status: "unpaid",
      financial_status: "pending",
      payment_method: "paypal",
    }

    assert.strictEqual(getRepaymentProvider(order), "paypal")
    assert.strictEqual(canRepayOrder(order), true)
  })

  it("uses PayPal for legacy pending unpaid orders without a payment method", () => {
    const order = {
      status: "pending",
      payment_status: "unpaid",
      financial_status: "pending",
      payment_method: null,
    }

    assert.strictEqual(getRepaymentProvider(order), "paypal")
    assert.strictEqual(canRepayOrder(order), true)
  })

  it("does not allow already paid or cancelled orders to be paid again", () => {
    assert.strictEqual(canRepayOrder({
      status: "paid",
      payment_status: "paid",
      financial_status: "paid",
      payment_method: "paypal",
    }), false)

    assert.strictEqual(canRepayOrder({
      status: "cancelled",
      payment_status: "unpaid",
      financial_status: "pending",
      payment_method: "paypal",
    }), false)
  })

  it("does not treat offline manual payment methods as online repayable", () => {
    const order = {
      status: "pending",
      payment_status: "unpaid",
      financial_status: "pending",
      payment_method: "cash_on_delivery",
    }

    assert.strictEqual(getRepaymentProvider(order), null)
    assert.strictEqual(canRepayOrder(order), false)
  })

  it("allows only pending unpaid orders to be cancelled by the customer", () => {
    assert.strictEqual(canCancelPendingOrder({
      status: "pending",
      payment_status: "unpaid",
      financial_status: "pending",
      payment_method: "paypal",
    }), true)

    assert.strictEqual(canCancelPendingOrder({
      status: "pending",
      payment_status: "paid",
      financial_status: "paid",
      payment_method: "paypal",
    }), false)

    assert.strictEqual(canCancelPendingOrder({
      status: "paid",
      payment_status: "paid",
      financial_status: "paid",
      payment_method: "paypal",
    }), false)
  })
})
