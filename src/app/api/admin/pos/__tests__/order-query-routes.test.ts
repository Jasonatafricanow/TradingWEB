import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requirePosOperatorSession: vi.fn(),
  listPosOrders: vi.fn(),
  getPosOrder: vi.fn(),
  transitionPickupFulfillment: vi.fn(),
}));

vi.mock("@/services/auth/auth-middleware", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/services/admin/pos-operator-session-service", () => ({ requirePosOperatorSession: mocks.requirePosOperatorSession }));
vi.mock("@/services/admin/pos-order-query-service", async (load) => ({
  ...await load<typeof import("@/services/admin/pos-order-query-service")>(),
  listPosOrders: mocks.listPosOrders,
  getPosOrder: mocks.getPosOrder,
  transitionPickupFulfillment: mocks.transitionPickupFulfillment,
}));

import { GET } from "../orders/route";
import { GET as GET_DETAIL } from "../orders/[id]/route";
import { PATCH } from "../orders/[id]/fulfillment/route";

const operator = { accountUserId: "user-1", staffId: "staff-1", storeId: "store-1", deviceId: "device-1", permissions: ["checkout"] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user-1", staffId: "staff-1", role: "operator" });
  mocks.requirePosOperatorSession.mockResolvedValue(operator);
});

describe("POS order query routes", () => {
  it("returns the canonical page envelope and passes parsed filters", async () => {
    const page = { items: [], page: 2, page_size: 50, total: 51, has_more: false };
    mocks.listPosOrders.mockResolvedValue(page);
    const response = await GET(new Request("https://example.test/api/admin/pos/orders?page=2&source=all&customer_id=customer-1") as never);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: page });
    expect(mocks.listPosOrders).toHaveBeenCalledWith(expect.objectContaining({
      operator,
      query: expect.objectContaining({ page: 2, source: null, customerId: "customer-1" }),
    }));
  });

  it("returns POS-scoped order detail", async () => {
    mocks.getPosOrder.mockResolvedValue({ id: "order-1", items: [], payments: [] });
    const response = await GET_DETAIL(new Request("https://example.test/api/admin/pos/orders/order-1") as never, { params: Promise.resolve({ id: "order-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.getPosOrder).toHaveBeenCalledWith(expect.objectContaining({ operator, orderId: "order-1" }));
  });

  it("rejects invalid pickup bodies and forwards a valid transition", async () => {
    const invalid = await PATCH(new Request("https://example.test/api/admin/pos/orders/order-1/fulfillment", {
      method: "PATCH", body: JSON.stringify({ fulfillment_status: "fulfilled" }), headers: { "content-type": "application/json" },
    }) as never, { params: Promise.resolve({ id: "order-1" }) });
    expect(invalid.status).toBe(400);
    expect(mocks.transitionPickupFulfillment).not.toHaveBeenCalled();

    const extra = await PATCH(new Request("https://example.test/api/admin/pos/orders/order-1/fulfillment", {
      method: "PATCH", body: JSON.stringify({ fulfillment_status: "ready", force: true }), headers: { "content-type": "application/json" },
    }) as never, { params: Promise.resolve({ id: "order-1" }) });
    expect(extra.status).toBe(400);
    expect(mocks.transitionPickupFulfillment).not.toHaveBeenCalled();

    mocks.transitionPickupFulfillment.mockResolvedValue({ id: "order-1", fulfillment_status: "ready" });
    const valid = await PATCH(new Request("https://example.test/api/admin/pos/orders/order-1/fulfillment", {
      method: "PATCH", body: JSON.stringify({ fulfillment_status: "ready" }), headers: { "content-type": "application/json" },
    }) as never, { params: Promise.resolve({ id: "order-1" }) });
    expect(valid.status).toBe(200);
    expect(mocks.transitionPickupFulfillment).toHaveBeenCalledWith(expect.objectContaining({ operator, orderId: "order-1", nextStatus: "ready" }));
  });

  it("fails before operator lookup for a non-POS account", async () => {
    mocks.requireUser.mockResolvedValue({ id: "user-1", staffId: null, role: "customer" });
    const response = await GET(new Request("https://example.test/api/admin/pos/orders") as never);
    expect(response.status).toBe(403);
    expect(mocks.requirePosOperatorSession).not.toHaveBeenCalled();
  });
});
