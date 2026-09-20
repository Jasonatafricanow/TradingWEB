import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requirePosOperatorSession: vi.fn(),
  listPosInventory: vi.fn(),
  listPosInventoryLocations: vi.fn(),
  adjustPosInventory: vi.fn(),
  createPosInventoryTransfer: vi.fn(),
  listPosPurchaseOrders: vi.fn(),
  createPosPurchaseOrder: vi.fn(),
  receivePosPurchaseOrder: vi.fn(),
}));

vi.mock("@/services/auth/auth-middleware", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/services/admin/pos-operator-session-service", () => ({
  requirePosOperatorSession: mocks.requirePosOperatorSession,
}));
vi.mock("@/services/admin/inventory-service", () => ({
  listPosInventory: mocks.listPosInventory,
  listPosInventoryLocations: mocks.listPosInventoryLocations,
  adjustPosInventory: mocks.adjustPosInventory,
  createPosInventoryTransfer: mocks.createPosInventoryTransfer,
}));
vi.mock("@/services/admin/pos-purchase-service", () => ({
  listPosPurchaseOrders: mocks.listPosPurchaseOrders,
  createPosPurchaseOrder: mocks.createPosPurchaseOrder,
  receivePosPurchaseOrder: mocks.receivePosPurchaseOrder,
}));

const operator = {
  accountUserId: "user-1", staffId: "staff-1", storeId: "store-1", deviceId: "device-1",
  permissions: ["inventory_read", "inventory_adjust", "inventory_transfer", "purchase_order_read", "purchase_order_create", "purchase_order_receive"],
};

function get(path: string) {
  return new Request(`https://example.test${path}`, { headers: { "X-POS-Device-ID": "device-1" } });
}

function post(path: string, body: unknown) {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-POS-Device-ID": "device-1" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user-1", staffId: "staff-1", role: "operator" });
  mocks.requirePosOperatorSession.mockResolvedValue(operator);
});

describe("Task 11 POS routes", () => {
  it("authenticates inventory and exposes locations even when stock is empty", async () => {
    mocks.listPosInventory.mockResolvedValue([]);
    mocks.listPosInventoryLocations.mockResolvedValue([
      { id: "warehouse-1", name: "Main", type: "warehouse", is_active: true, is_store_default: true },
    ]);
    const inventory = await import("../inventory/route");
    const locations = await import("../inventory/locations/route");

    const inventoryResponse = await inventory.GET(get("/api/admin/pos/inventory") as never);
    const locationResponse = await locations.GET(get("/api/admin/pos/inventory/locations") as never);

    expect(await inventoryResponse.json()).toEqual({ data: [] });
    expect(await locationResponse.json()).toEqual({ data: [expect.objectContaining({ id: "warehouse-1" })] });
    expect(mocks.requirePosOperatorSession).toHaveBeenCalledWith(expect.any(Request), "user-1");
  });

  it("passes only a strict adjustment plus authenticated operator to the service", async () => {
    const body = {
      idempotency_key: "adjust-1", store_id: "store-1", product_id: "product-1", variant_id: null,
      location_id: "warehouse-1", delta: -1, reason: "damage", note: null, approval_token: "approval",
    };
    mocks.adjustPosInventory.mockResolvedValue({ id: "adjustment-1" });
    const { POST } = await import("../inventory/adjustments/route");
    const response = await POST(post("/api/admin/pos/inventory/adjustments", body) as never);
    expect(response.status).toBe(201);
    expect(mocks.adjustPosInventory).toHaveBeenCalledWith({ ...body, operator });
  });

  it("creates only a pending transfer through the POS adapter", async () => {
    const body = {
      idempotency_key: "transfer-1", store_id: "store-1", from_location_id: "warehouse-1",
      to_location_id: "warehouse-2", note: null,
      items: [{ product_id: "product-1", variant_id: null, quantity: 2 }],
    };
    mocks.createPosInventoryTransfer.mockResolvedValue({ id: "transfer-1", reference_no: "TF-1", status: "pending" });
    const { POST } = await import("../inventory/transfers/route");
    const response = await POST(post("/api/admin/pos/inventory/transfers", body) as never);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: expect.objectContaining({ status: "pending" }) });
  });

  it("lists and creates purchase orders under the operator session", async () => {
    mocks.listPosPurchaseOrders.mockResolvedValue([]);
    mocks.createPosPurchaseOrder.mockResolvedValue({ id: "po-1" });
    const route = await import("../purchase-orders/route");
    const listResponse = await route.GET(get("/api/admin/pos/purchase-orders") as never);
    expect(await listResponse.json()).toEqual({ data: [] });

    const body = {
      idempotency_key: "po-create-1", store_id: "store-1", location_id: "warehouse-1",
      supplier: "Supplier A", items: [{ product_id: "product-1", variant_id: null, ordered_qty: 2, unit_cost: "3.25" }],
    };
    const createResponse = await route.POST(post("/api/admin/pos/purchase-orders", body) as never);
    expect(createResponse.status).toBe(201);
    expect(mocks.createPosPurchaseOrder).toHaveBeenCalledWith({ ...body, operator });
  });

  it("receives only the path order with the whole-order contract", async () => {
    mocks.receivePosPurchaseOrder.mockResolvedValue({ id: "po-1", status: "received" });
    const { POST } = await import("../purchase-orders/[id]/receive/route");
    const response = await POST(post("/api/admin/pos/purchase-orders/po-1/receive", {
      idempotency_key: "receive-1", store_id: "store-1", approval_token: "approval-token",
    }) as never, { params: Promise.resolve({ id: "po-1" }) });
    expect(await response.json()).toEqual({ data: { id: "po-1", status: "received" } });
    expect(mocks.receivePosPurchaseOrder).toHaveBeenCalledWith({
      idempotency_key: "receive-1", store_id: "store-1", approval_token: "approval-token",
      purchase_order_id: "po-1", operator,
    });
  });

  it("fails closed before services for a non-POS account", async () => {
    mocks.requireUser.mockResolvedValueOnce({ id: "user-1", staffId: null, role: "customer" });
    const { GET } = await import("../inventory/route");
    const response = await GET(get("/api/admin/pos/inventory") as never);
    expect(response.status).toBe(403);
    expect(mocks.requirePosOperatorSession).not.toHaveBeenCalled();
    expect(mocks.listPosInventory).not.toHaveBeenCalled();
  });
});
