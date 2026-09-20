import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), requirePosOperatorSession: vi.fn(), exchangePosOrder: vi.fn(), refundPosOrder: vi.fn() }));
vi.mock("@/services/auth/auth-middleware", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/services/admin/pos-operator-session-service", () => ({ requirePosOperatorSession: mocks.requirePosOperatorSession }));
vi.mock("@/services/admin/pos-exchange-service", () => ({ exchangePosOrder: mocks.exchangePosOrder }));
vi.mock("@/services/admin/refund-service", () => ({ refundPosOrder: mocks.refundPosOrder }));

const checkout = {
  idempotency_key: "replacement-1", store_id: "store-1", currency: "USD", staff_id: "staff-1", customer_id: null, note: null,
  fulfillment: { method: "in_store" }, items: [{ product_id: "product-1", variant_id: null, quantity: 1, line_discount: "0.00" }],
  order_discount: "0.00", pricing_preview: { subtotal: "12.00", discount: "0.00", tax: "0.00", total: "12.00" }, pricing_version: "v1",
  payments: [{ method: "cash", label: "Cash", amount: "12.00", reference: null }],
};

function post(url: string, body: unknown) {
  return new Request(url, { method: "POST", headers: { authorization: "Bearer jwt", "content-type": "application/json", "X-POS-Operator-Session": "session", "X-POS-Device-ID": "device-1" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user-1", role: "operator", staffId: "account-staff" });
  mocks.requirePosOperatorSession.mockResolvedValue({ accountUserId: "user-1", staffId: "staff-1", storeId: "store-1", deviceId: "device-1", permissions: ["refund", "exchange"] });
});

describe("Task 8 POS routes", () => {
  it("binds account and operator to a strict exchange request", async () => {
    mocks.exchangePosOrder.mockResolvedValue({ exchange_id: "exchange-1" });
    const body = { idempotency_key: "exchange-1", store_id: "store-1", original_order_id: "order-1", return_items: [{ order_item_id: "item-1", quantity: 1, restock: true }], replacement: checkout, difference_payment: [{ method: "cash", label: "Cash", amount: "2.00", reference: null }], approval_token: null };
    const { POST } = await import("../exchanges/route");
    const response = await POST(post("https://example.test/api/admin/pos/exchanges", body) as never);
    expect(response.status).toBe(201);
    expect(mocks.exchangePosOrder).toHaveBeenCalledWith(expect.objectContaining({ ...body, account_user_id: "user-1", operator: expect.objectContaining({ staffId: "staff-1" }) }));
  });

  it("binds the path order id and rejects forged store identity for refunds", async () => {
    const { POST } = await import("../orders/[id]/refunds/route");
    const return_items = [{ order_item_id: "item-1", quantity: 1, restock: true }];
    const forged = await POST(post("https://example.test/api/admin/pos/orders/order-1/refunds", { idempotency_key: "refund-1", store_id: "other", return_items, reason: "return", approval_token: null }) as never, { params: Promise.resolve({ id: "order-1" }) });
    expect(forged.status).toBe(403);
    expect(mocks.refundPosOrder).not.toHaveBeenCalled();

    mocks.refundPosOrder.mockResolvedValue({ refund_id: "refund-row" });
    const ok = await POST(post("https://example.test/api/admin/pos/orders/order-1/refunds", { idempotency_key: "refund-1", store_id: "store-1", return_items, reason: "return", approval_token: null }) as never, { params: Promise.resolve({ id: "order-1" }) });
    expect(ok.status).toBe(201);
    expect(mocks.refundPosOrder).toHaveBeenCalledWith(expect.objectContaining({ order_id: "order-1", account_user_id: "user-1" }));
  });
});
