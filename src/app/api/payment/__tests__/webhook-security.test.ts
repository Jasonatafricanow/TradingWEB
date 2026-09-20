import { describe, it, afterEach } from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import { POST } from "../webhook/route"

const originalEnv = {
  ALLOW_UNSIGNED_WEBHOOKS: process.env.ALLOW_UNSIGNED_WEBHOOKS,
  PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

function makeWebhookRequest(url: string, provider: "paypal" | "stripe", body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-payment-provider": provider,
    },
    body: JSON.stringify(body),
  })
}

describe("payment webhook signature policy", () => {
  afterEach(restoreEnv)

  it("rejects unsigned PayPal webhooks when no explicit local debug switch is enabled", async () => {
    delete process.env.ALLOW_UNSIGNED_WEBHOOKS
    delete process.env.PAYPAL_WEBHOOK_ID

    const response = await POST(makeWebhookRequest(
      "http://localhost:5000/api/payment/webhook",
      "paypal",
      { event_type: "CHECKOUT.ORDER.APPROVED", resource: {} },
    ))

    assert.strictEqual(response.status, 503)
    assert.match(await response.text(), /PAYPAL_WEBHOOK_ID not configured/)
  })

  it("allows unsigned PayPal webhooks only for localhost when the debug switch is explicit", async () => {
    process.env.ALLOW_UNSIGNED_WEBHOOKS = "true"
    delete process.env.PAYPAL_WEBHOOK_ID

    const response = await POST(makeWebhookRequest(
      "http://localhost:5000/api/payment/webhook",
      "paypal",
      { event_type: "CHECKOUT.ORDER.APPROVED", resource: {} },
    ))

    assert.strictEqual(response.status, 200)
    assert.deepStrictEqual(await response.json(), { received: true })
  })

  it("does not allow the unsigned debug switch on public hosts", async () => {
    process.env.ALLOW_UNSIGNED_WEBHOOKS = "true"
    delete process.env.PAYPAL_WEBHOOK_ID

    const response = await POST(makeWebhookRequest(
      "https://staging.example.com/api/payment/webhook",
      "paypal",
      { event_type: "CHECKOUT.ORDER.APPROVED", resource: {} },
    ))

    assert.strictEqual(response.status, 503)
  })

  it("rejects unsigned Stripe webhooks when no signing secret is configured", async () => {
    delete process.env.ALLOW_UNSIGNED_WEBHOOKS
    delete process.env.STRIPE_WEBHOOK_SECRET
    delete process.env.WEBHOOK_SECRET

    const response = await POST(makeWebhookRequest(
      "http://localhost:5000/api/payment/webhook",
      "stripe",
      { type: "payment_intent.created", data: { object: {} } },
    ))

    assert.strictEqual(response.status, 503)
    assert.match(await response.text(), /STRIPE_WEBHOOK_SECRET not configured/)
  })
})
