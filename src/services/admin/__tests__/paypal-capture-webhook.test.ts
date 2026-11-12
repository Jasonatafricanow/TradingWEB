import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ capture: vi.fn(), order: vi.fn(), paid: vi.fn() }));
vi.mock("@/services/orders/order-service", () => ({ getOrder: mocks.order, markOrderPaidIfNotAlready: mocks.paid, updateOrder: vi.fn() }));
vi.mock("@/services/payment/payment-service", () => ({ getPaymentProvider: () => ({ getCaptureById: mocks.capture }) }));
import { POST } from "@/app/api/payment/webhook/route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ALLOW_UNSIGNED_WEBHOOKS", "true"); vi.stubEnv("PAYPAL_WEBHOOK_ID", "");
  vi.stubEnv("PAYPAL_CLIENT_ID", "test"); vi.stubEnv("PAYPAL_CLIENT_SECRET", "test");
  mocks.capture.mockResolvedValue({ success: true, status: "paid", referenceOrderId: "order", transactionId: "capture", amountMinor: 9000, currency: "USD", captureStatus: "COMPLETED" });
  mocks.order.mockResolvedValue({ id: "order", total_amount: "90.00", currency: "USD", payment_status: "unpaid" });
  mocks.paid.mockResolvedValue({ transitioned: true });
});
afterEach(() => vi.unstubAllEnvs());
function request() {
  return new NextRequest("http://localhost/api/payment/webhook", { method: "POST", headers: { "x-payment-provider": "paypal", "content-type": "application/json" }, body: JSON.stringify({ event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "capture" } }) });
}
it("resolves a real capture-shaped event through PayPal before local finalization", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(mocks.capture).toHaveBeenCalledWith("capture");
  expect(mocks.order).toHaveBeenCalledWith("order");
  expect(mocks.paid).toHaveBeenCalledWith("order", expect.objectContaining({ payment_id: "capture", external_payment_confirmed: true }));
});
it("requests retry when provider verification is unavailable and writes nothing", async () => {
  mocks.capture.mockResolvedValueOnce({ success: false });
  expect((await POST(request())).status).toBe(503);
  expect(mocks.paid).not.toHaveBeenCalled();
});
