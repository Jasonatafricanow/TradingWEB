import { afterEach, describe, expect, it, vi } from "vitest";
import { PayPalProvider } from "@/services/payment/paypal-provider";
import { StripeProvider } from "@/services/payment/stripe-provider";
import { POST as legacyCheckout } from "@/app/api/pos/orders/route";
afterEach(() => vi.unstubAllGlobals());
describe("payment amount regressions", () => {
  it.each([90, 100, 110])("PayPal submits authoritative payable %s", async totalAmount => {
    const fetcher = vi.fn().mockResolvedValueOnce({ json: async () => ({ access_token: "test" }) })
      .mockResolvedValueOnce({ json: async () => ({ id: "pp-order", links: [] }) });
    vi.stubGlobal("fetch", fetcher);
    await new PayPalProvider("test", "test", true).createPayment({ orderId: "order", items: [{ name: "Item", quantity: 1, unitPrice: 100, currency: "USD" }], totalAmount, discountAmount: totalAmount < 100 ? 10 : 0, currency: "USD", returnUrl: "https://example.test/return", cancelUrl: "https://example.test/cancel" });
    const payload = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(payload.purchase_units[0].amount.value).toBe(totalAmount.toFixed(2));
    const b = payload.purchase_units[0].amount.breakdown;
    expect(Number(b.item_total.value) + Number(b.shipping?.value || 0) - Number(b.discount?.value || 0)).toBe(totalAmount);
  });
  it.each([90, 100, 110])("Stripe submits authoritative payable %s", async totalAmount => {
    const fetcher = vi.fn().mockResolvedValue({ json: async () => ({ id: "session" }) });
    vi.stubGlobal("fetch", fetcher);
    await new StripeProvider("test", "test", true).createPayment({ orderId: "order", items: [{ name: "Item", quantity: 1, unitPrice: 100, currency: "USD" }], totalAmount, currency: "USD", returnUrl: "https://example.test/return", cancelUrl: "https://example.test/cancel" });
    expect(new URLSearchParams(fetcher.mock.calls[0][1].body).get("line_items[0][price_data][unit_amount]")).toBe(String(totalAmount * 100));
  });
  it("PayPal refund preserves currency and retry identity", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ json: async () => ({ access_token: "test" }) })
      .mockResolvedValueOnce({ json: async () => ({ id: "refund", status: "COMPLETED" }) });
    vi.stubGlobal("fetch", fetcher);
    await new PayPalProvider("test", "test", true).refund({ paymentId: "capture", amount: 12, currency: "EUR", refundId: "local-refund" });
    expect(JSON.parse(fetcher.mock.calls[1][1].body).amount.currency_code).toBe("EUR");
    expect(fetcher.mock.calls[1][1].headers["PayPal-Request-Id"]).toBe("local-refund");
  });
  it("retired checkout cannot write an arbitrary priced order", async () => {
    expect((await legacyCheckout()).status).toBe(410);
  });
});
