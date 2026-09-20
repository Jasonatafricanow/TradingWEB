import { describe, expect, it, vi } from "vitest";

import { createPosPurchaseOrder, listPosPurchaseOrders, receivePosPurchaseOrder } from "../pos-purchase-service";

const operator = {
  accountUserId: "user-1", staffId: "staff-1", storeId: "store-1", deviceId: "device-1",
  permissions: ["purchase_order_read", "purchase_order_create", "purchase_order_receive"],
};

function dependencies() {
  const tx = { tx: true };
  const now = new Date("2026-07-19T08:00:00.000Z");
  const order = {
    id: "po-1", number: "PO-20260719-000001", supplier: "Supplier A", storeId: "store-1",
    locationId: "warehouse-1", status: "ordered", createdBy: "staff-1", receivedBy: null,
    idempotencyKey: "po-create-1", createdAt: now, receivedAt: null,
  };
  const items = [{
    id: "poi-1", purchaseOrderId: "po-1", productId: "product-1", variantId: null,
    orderedQty: 2, receivedQty: 0, unitCost: "3.25",
    productTitle: "Coffee", variantTitle: null, sku: "COF-1",
  }];
  const deps = {
    transaction: vi.fn(async (work) => work(tx)),
    runIdempotent: vi.fn(async (_input, work) => work()),
    getStoreLocation: vi.fn().mockResolvedValue({ storeId: "store-1", warehouseId: "warehouse-1", active: true }),
    validateProductVariant: vi.fn().mockResolvedValue({ productTitle: "Coffee", variantTitle: null, sku: "COF-1" }),
    listOrders: vi.fn().mockResolvedValue([{ order, items }]),
    insertOrder: vi.fn().mockResolvedValue(undefined),
    insertItems: vi.fn().mockResolvedValue(undefined),
    lockOrder: vi.fn().mockResolvedValue(order),
    lockItems: vi.fn().mockResolvedValue(items),
    lockInventory: vi.fn().mockResolvedValue({ id: "inventory-1", stock: 5 }),
    insertInventory: vi.fn().mockResolvedValue(true),
    updateInventory: vi.fn().mockResolvedValue(undefined),
    insertInventoryTransaction: vi.fn().mockResolvedValue(undefined),
    markItemsReceived: vi.fn().mockResolvedValue(undefined),
    markOrderReceived: vi.fn().mockResolvedValue(undefined),
    consumeApprovalToken: vi.fn().mockResolvedValue("manager-1"),
    enqueueAuditEvent: vi.fn().mockResolvedValue(undefined),
    newId: vi.fn().mockReturnValueOnce("po-1").mockReturnValueOnce("poi-1").mockReturnValue("inventory-1"),
    newNumber: vi.fn().mockReturnValue("PO-20260719-000001"),
    now: vi.fn().mockReturnValue(now),
  };
  return { deps, tx, order, items };
}

describe("POS purchase orders", () => {
  it("lists only orders from the authenticated store", async () => {
    const { deps } = dependencies();
    const result = await listPosPurchaseOrders({ operator }, deps as never);
    expect(deps.listOrders).toHaveBeenCalledWith("store-1");
    expect(result[0]).toMatchObject({ id: "po-1", store_id: "store-1", status: "ordered" });
  });

  it("creates a store-bound order idempotently", async () => {
    const { deps, tx } = dependencies();
    const result = await createPosPurchaseOrder({
      idempotency_key: "po-create-1", store_id: "store-1", location_id: "warehouse-1",
      supplier: "Supplier A", items: [{ product_id: "product-1", variant_id: null, ordered_qty: 2, unit_cost: "3.25" }],
      operator,
    }, deps as never);
    expect(deps.runIdempotent).toHaveBeenCalledWith(expect.objectContaining({
      key: "po-create-1", operation: "purchase_create", storeId: "store-1",
    }), expect.any(Function), expect.objectContaining({ responseStatus: 201, resourceType: "purchase_order" }));
    expect(deps.insertOrder).toHaveBeenCalledWith(expect.objectContaining({ id: "po-1", storeId: "store-1" }), tx);
    expect(deps.enqueueAuditEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
      eventType: "pos.purchase_order.created", entityId: "po-1",
    }));
    expect(result).toMatchObject({ id: "po-1", number: "PO-20260719-000001", items: [{ ordered_qty: 2 }] });
    expect(result.items[0]).toMatchObject({ product_title: "Coffee", variant_title: null, sku: "COF-1" });
    expect(deps.validateProductVariant).toHaveBeenCalledWith("product-1", null, tx);
  });

  it("rejects a missing product or mismatched variant before creating a purchase order", async () => {
    const { deps } = dependencies();
    deps.validateProductVariant.mockResolvedValueOnce(null);
    await expect(createPosPurchaseOrder({
      idempotency_key: "po-invalid-1", store_id: "store-1", location_id: "warehouse-1",
      supplier: "Supplier A", items: [{ product_id: "product-1", variant_id: "other-variant", ordered_qty: 2, unit_cost: "3.25" }],
      operator,
    }, deps as never)).rejects.toMatchObject({ code: "PRODUCT_VARIANT_MISMATCH", status: 400 });
    expect(deps.insertOrder).not.toHaveBeenCalled();
    expect(deps.insertItems).not.toHaveBeenCalled();
  });

  it("replays create without inserting another order", async () => {
    const { deps } = dependencies();
    const replay = { id: "po-existing", status: "ordered" };
    deps.runIdempotent.mockResolvedValueOnce(replay);
    await expect(createPosPurchaseOrder({
      idempotency_key: "po-create-1", store_id: "store-1", location_id: "warehouse-1",
      supplier: "Supplier A", items: [{ product_id: "product-1", variant_id: null, ordered_qty: 2, unit_cost: "3.25" }],
      operator,
    }, deps as never)).resolves.toBe(replay);
    expect(deps.transaction).not.toHaveBeenCalled();
    expect(deps.insertOrder).not.toHaveBeenCalled();
  });

  it("rejects receive without a one-time approval token before any inventory write", async () => {
    const { deps } = dependencies();
    await expect(receivePosPurchaseOrder({
      purchase_order_id: "po-1", idempotency_key: "receive-no-token", store_id: "store-1",
      approval_token: null, operator,
    }, deps as never)).rejects.toMatchObject({ code: "APPROVAL_REQUIRED", status: 403 });
    expect(deps.transaction).not.toHaveBeenCalled();
    expect(deps.updateInventory).not.toHaveBeenCalled();
  });

  it("reselects inventory after a concurrent receipt creates the same scope", async () => {
    const { deps } = dependencies();
    deps.lockInventory.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "inventory-winner", stock: 3 });
    deps.insertInventory.mockResolvedValueOnce(false);
    await receivePosPurchaseOrder({
      purchase_order_id: "po-1", idempotency_key: "po-race-1", store_id: "store-1",
      approval_token: "approval-token", operator,
    }, deps as never);
    expect(deps.lockInventory).toHaveBeenCalledTimes(2);
    expect(deps.updateInventory).toHaveBeenCalledWith("inventory-winner", 5, expect.anything());
  });

  it("receives the whole order atomically and journals each inventory line", async () => {
    const { deps, tx } = dependencies();
    const result = await receivePosPurchaseOrder({
      purchase_order_id: "po-1", idempotency_key: "po-receive-1", store_id: "store-1",
      approval_token: "approval-token", operator,
    }, deps as never);
    expect(deps.consumeApprovalToken).toHaveBeenCalledWith(
      "approval-token", "receive", expect.stringMatching(/^[a-f0-9]{64}$/), "store-1", tx,
    );
    expect(deps.lockOrder).toHaveBeenCalledWith("po-1", tx);
    expect(deps.lockItems).toHaveBeenCalledWith("po-1", tx);
    expect(deps.lockInventory).toHaveBeenCalledWith(expect.objectContaining({
      storeId: "store-1", warehouseId: "warehouse-1", productId: "product-1",
    }), tx);
    expect(deps.updateInventory).toHaveBeenCalledWith("inventory-1", 7, tx);
    expect(deps.insertInventoryTransaction).toHaveBeenCalledWith(expect.objectContaining({
      quantity: 2, beforeStock: 5, afterStock: 7, referenceType: "purchase_order", referenceId: "po-1",
    }), tx);
    expect(deps.markItemsReceived).toHaveBeenCalledWith("po-1", tx);
    expect(deps.markOrderReceived).toHaveBeenCalledWith("po-1", "staff-1", expect.any(Date), tx);
    expect(deps.enqueueAuditEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
      eventType: "pos.purchase_order.received", entityId: "po-1",
    }));
    expect(deps.enqueueAuditEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
      payload: expect.objectContaining({ approved_by: "manager-1" }),
    }));
    expect(result).toMatchObject({ id: "po-1", status: "received", items: [{ received_qty: 2 }] });
  });

  it("rejects cross-store and partial/already received state without inventory writes", async () => {
    const { deps, order } = dependencies();
    deps.lockOrder.mockResolvedValueOnce({ ...order, storeId: "store-2" });
    await expect(receivePosPurchaseOrder({
      purchase_order_id: "po-1", idempotency_key: "receive-1", store_id: "store-1",
      approval_token: "approval-token", operator,
    }, deps as never)).rejects.toMatchObject({ code: "PURCHASE_ORDER_NOT_FOUND", status: 404 });
    expect(deps.updateInventory).not.toHaveBeenCalled();

    deps.lockOrder.mockResolvedValueOnce({ ...order, status: "received" });
    await expect(receivePosPurchaseOrder({
      purchase_order_id: "po-1", idempotency_key: "receive-2", store_id: "store-1",
      approval_token: "approval-token", operator,
    }, deps as never)).rejects.toMatchObject({ code: "PURCHASE_ORDER_ALREADY_RECEIVED", status: 409 });

    deps.lockOrder.mockResolvedValueOnce(order);
    deps.lockItems.mockResolvedValueOnce([{ ...dependencies().items[0], receivedQty: 1 }]);
    await expect(receivePosPurchaseOrder({
      purchase_order_id: "po-1", idempotency_key: "receive-3", store_id: "store-1",
      approval_token: "approval-token", operator,
    }, deps as never)).rejects.toMatchObject({ code: "PARTIAL_RECEIPT_UNSUPPORTED", status: 409 });
    expect(deps.updateInventory).not.toHaveBeenCalled();
  });

  it("replays receive without opening another transaction", async () => {
    const { deps } = dependencies();
    const replay = { id: "po-1", status: "received" };
    deps.runIdempotent.mockResolvedValueOnce(replay);
    await expect(receivePosPurchaseOrder({
      purchase_order_id: "po-1", idempotency_key: "receive-1", store_id: "store-1",
      approval_token: "approval-token", operator,
    }, deps as never)).resolves.toBe(replay);
    expect(deps.transaction).not.toHaveBeenCalled();
    expect(deps.consumeApprovalToken).not.toHaveBeenCalled();
  });
});
