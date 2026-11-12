import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), refund: vi.fn(), transaction: vi.fn() }));
vi.mock("@/services/payment/paypal-provider", () => ({ PayPalProvider: class { getRefundById = mocks.verify; refund = mocks.refund; } }));
vi.mock("@/lib/db", () => ({ db: { transaction: mocks.transaction } }));
import { completeRefund, submitPayPalRefund } from "../refund-service";
function database(status = "processing", refunded = "0.00") {
  const refund = { id: "refund", order_id: "order", amount: "10.00", status, reason: "return", admin_note: "approved" };
  const order = { id: "order", source: "web", payment_method: "paypal", payment_id: "capture", total_amount: "20.00", refunded_total: refunded, currency: "EUR" };
  const reads = [[refund], [order], [refund], [{ ...refund, status: "completed" }]];
  const updates: Record<string, unknown>[] = [];
  const tx = {
    select: () => { const q = { from: () => q, where: () => q, for: () => q, limit: async () => reads.shift() }; return q; },
    update: () => ({ set: (value: Record<string, unknown>) => { updates.push(value); return { where: async () => undefined }; } }),
  };
  mocks.transaction.mockImplementation(async work => work(tx));
  return { updates };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PAYPAL_CLIENT_ID", "test"); vi.stubEnv("PAYPAL_CLIENT_SECRET", "test");
  mocks.verify.mockResolvedValue({ id: "pp-refund", localRefundId: "refund", status: "COMPLETED", amount: "10.00", currency: "EUR" });
});
describe("verified online refunds", () => {
  it("updates cumulative partial amount without claiming inventory restoration", async () => {
    const { updates } = database();
    await completeRefund("refund", "pp-refund");
    expect(updates[0]).not.toHaveProperty("restocked");
    expect(updates[1]).toMatchObject({ refunded_total: "10.00", financial_status: "partially_refunded" });
  });
  it("marks a full cumulative refund and replays completed confirmations without writes", async () => {
    const { updates } = database("processing", "10.00");
    await completeRefund("refund", "pp-refund");
    expect(updates[1]).toMatchObject({ refunded_total: "20.00", payment_status: "refunded" });
    const replay = database("completed");
    await completeRefund("refund", "pp-refund");
    expect(replay.updates).toEqual([]);
  });
  it("rejects provider currency mismatch", async () => {
    const { updates } = database();
    mocks.verify.mockResolvedValueOnce({ id: "pp-refund", localRefundId: "refund", status: "COMPLETED", amount: "10.00", currency: "USD" });
    await expect(completeRefund("refund", "pp-refund")).rejects.toMatchObject({ code: "REFUND_MISMATCH" });
    expect(updates).toEqual([]);
  });
  it("persists processing before provider submission and does not claim success on uncertainty", async () => {
    const { updates } = database("approved");
    mocks.refund.mockImplementation(async () => { expect(updates[0]).toMatchObject({ status: "processing" }); return { success: false }; });
    await expect(submitPayPalRefund("refund", "admin")).rejects.toMatchObject({ code: "REFUND_PENDING_VERIFICATION" });
    expect(mocks.refund).toHaveBeenCalledWith(expect.objectContaining({ currency: "EUR", refundId: "refund", paymentId: "capture" }));
    expect(updates).toHaveLength(1);
  });
  it("rejects resubmission of an unresolved processing refund", async () => {
    database();
    await expect(submitPayPalRefund("refund", "admin")).rejects.toMatchObject({ code: "INVALID_REFUND_STATE" });
    expect(mocks.refund).not.toHaveBeenCalled();
  });
});

afterEach(() => vi.unstubAllEnvs());
