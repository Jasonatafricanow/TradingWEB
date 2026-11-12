import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ charge: vi.fn(), intent: vi.fn(), session: vi.fn(), transaction: vi.fn(), update: vi.fn(), insert: vi.fn() }));
vi.mock("stripe", () => ({ default: class { charges = { retrieve: mocks.charge }; paymentIntents = { retrieve: mocks.intent }; checkout = { sessions: { retrieve: mocks.session } }; } }));
vi.mock("@/lib/db", () => ({ db: { transaction: mocks.transaction } }));
import { reconcileStripeChargeRefund } from "../stripe-refund-reconciliation";
function setup(refunded = "0.00") {
  const order = { id: "o", payment_method: "stripe", payment_id: "cs_1", currency: "EUR", total_amount: "20.00", refunded_total: refunded };
  const tx = { select: () => ({ from: () => ({ where: () => ({ for: () => ({ limit: async () => [order] }) }) }) }), update: () => ({ set: (value: unknown) => { mocks.update(value); return { where: async () => {} }; } }), insert: () => ({ values: mocks.insert }) };
  mocks.transaction.mockImplementation(work => work(tx));
}
beforeEach(() => {
  vi.clearAllMocks(); process.env.STRIPE_SECRET_KEY = "test";
  mocks.charge.mockResolvedValue({ id: "ch_1", payment_intent: "pi_1", currency: "eur", amount: 2000, amount_refunded: 500, paid: true });
  mocks.intent.mockResolvedValue({ metadata: { order_id: "o" } });
  mocks.session.mockResolvedValue({ payment_intent: "pi_1" });
});
describe("Stripe cumulative refund events", () => {
  it("records partial refunds without marking the whole order refunded", async () => {
    setup(); await reconcileStripeChargeRefund("ch_1");
    expect(mocks.update).toHaveBeenCalledWith({ refunded_total: "5.00", has_refund: true, financial_status: "partially_refunded" });
  });
  it("does not reapply duplicate or out-of-order cumulative amounts", async () => {
    setup("10.00"); await reconcileStripeChargeRefund("ch_1");
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("marks full refund only at the original total", async () => {
    setup(); mocks.charge.mockResolvedValueOnce({ ...(await mocks.charge()), amount_refunded: 2000 });
    await reconcileStripeChargeRefund("ch_1");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ refunded_total: "20.00", payment_status: "refunded" }));
  });
  it("rejects a different original payment", async () => {
    setup(); mocks.session.mockResolvedValueOnce({ payment_intent: "pi_other" });
    await expect(reconcileStripeChargeRefund("ch_1")).rejects.toThrow("mismatch");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
