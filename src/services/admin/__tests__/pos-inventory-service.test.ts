import { describe, expect, it, vi } from "vitest";

import {
  adjustPosInventory,
  createPosInventoryTransfer,
  listPosInventory,
  listPosInventoryLocations,
} from "../inventory-service";

const operator = {
  accountUserId: "user-1", staffId: "staff-1", storeId: "store-1", deviceId: "device-1",
  permissions: ["inventory_read", "inventory_adjust", "inventory_transfer"],
};

function dependencies() {
  const tx = { tx: true };
  const row = {
    id: "inventory-1", productId: "product-1", variantId: null, storeId: "store-1",
    warehouseId: "warehouse-1", stock: 5, lowStockThreshold: 2,
    productTitle: "Coffee", variantTitle: null, sku: null,
  };
  const deps = {
    transaction: vi.fn(async (work) => work(tx)),
    runIdempotent: vi.fn(async (_input, work) => work()),
    getStoreLocation: vi.fn().mockResolvedValue({ storeId: "store-1", warehouseId: "warehouse-1", active: true }),
    listInventory: vi.fn().mockResolvedValue([row]),
    listLocations: vi.fn().mockResolvedValue([{ id: "warehouse-1", name: "Main warehouse", type: "warehouse", active: true }]),
    validateProductVariant: vi.fn().mockResolvedValue({ productTitle: "Coffee", variantTitle: null, sku: null }),
    lockInventory: vi.fn().mockResolvedValue(row),
    insertInventory: vi.fn().mockResolvedValue(true),
    updateInventory: vi.fn().mockResolvedValue(undefined),
    insertInventoryTransaction: vi.fn().mockResolvedValue(undefined),
    consumeApprovalToken: vi.fn().mockResolvedValue("manager-1"),
    enqueueAuditEvent: vi.fn().mockResolvedValue(undefined),
    createTransfer: vi.fn().mockResolvedValue({
      id: "transfer-1", referenceNo: "TF-1", status: "pending",
      storeId: "store-1",
      fromLocationId: "warehouse-1", toLocationId: "warehouse-2", operatorId: "staff-1",
      items: [{ productId: "product-1", variantId: null, quantity: 2 }],
    }),
    locationExists: vi.fn().mockResolvedValue(true),
    newId: vi.fn().mockReturnValue("adjustment-1"),
  };
  return { deps, tx, row };
}

describe("POS inventory", () => {
  it("lists only the operator store and its bound warehouse", async () => {
    const { deps } = dependencies();
    const result = await listPosInventory({ operator }, deps as never);
    expect(deps.listInventory).toHaveBeenCalledWith("store-1", "warehouse-1");
    expect(result).toEqual([expect.objectContaining({
      id: "inventory-1", store_id: "store-1", location_id: "warehouse-1",
      location_name: "Main warehouse", stock: 5,
    })]);
  });

  it("discovers active locations independently from inventory rows", async () => {
    const { deps } = dependencies();
    deps.listInventory.mockResolvedValueOnce([]);
    deps.listLocations.mockResolvedValueOnce([
      { id: "warehouse-1", name: "Main warehouse", type: "warehouse", active: true },
      { id: "warehouse-2", name: "Overflow", type: "warehouse", active: true },
    ]);
    await expect(listPosInventoryLocations({ operator, purpose: "inventory_transfer" }, deps as never)).resolves.toEqual([
      expect.objectContaining({ id: "warehouse-1", is_store_default: true }),
      expect.objectContaining({ id: "warehouse-2", is_store_default: false }),
    ]);
    expect(deps.listInventory).not.toHaveBeenCalled();
  });

  it("exposes only the active store default for adjustment or purchase-only operators", async () => {
    const first = dependencies();
    first.deps.listLocations.mockResolvedValueOnce([
      { id: "warehouse-1", name: "Main warehouse", type: "warehouse", active: true },
      { id: "warehouse-2", name: "Overflow", type: "warehouse", active: true },
    ]);
    await expect(listPosInventoryLocations({ operator, purpose: "inventory_adjustment" }, first.deps as never))
      .resolves.toEqual([expect.objectContaining({ id: "warehouse-1", is_store_default: true })]);

    const second = dependencies();
    second.deps.listLocations.mockResolvedValueOnce([
      { id: "warehouse-1", name: "Main warehouse", type: "warehouse", active: true },
      { id: "warehouse-2", name: "Overflow", type: "warehouse", active: true },
    ]);
    const purchaseOnly = { ...operator, permissions: ["purchase_order_create"] };
    await expect(listPosInventoryLocations({ operator: purchaseOnly, purpose: "purchase_order" }, second.deps as never))
      .resolves.toEqual([expect.objectContaining({ id: "warehouse-1", is_store_default: true })]);
  });

  it("locks, approves, updates, journals and audits an adjustment in one transaction", async () => {
    const { deps, tx } = dependencies();
    const result = await adjustPosInventory({
      idempotency_key: "adjust-1", store_id: "store-1", product_id: "product-1",
      variant_id: null, location_id: "warehouse-1", delta: -2, reason: "damage",
      note: "Broken", approval_token: "approval-token", operator,
    }, deps as never);
    expect(deps.consumeApprovalToken).toHaveBeenCalledWith(
      "approval-token", "inventory_adjustment", expect.stringMatching(/^[a-f0-9]{64}$/), "store-1", tx,
    );
    expect(deps.lockInventory).toHaveBeenCalledWith(expect.objectContaining({
      storeId: "store-1", warehouseId: "warehouse-1", productId: "product-1",
    }), tx);
    expect(deps.validateProductVariant).toHaveBeenCalledWith("product-1", null, tx);
    expect(deps.updateInventory).toHaveBeenCalledWith("inventory-1", 3, tx);
    expect(deps.insertInventoryTransaction).toHaveBeenCalledWith(expect.objectContaining({
      beforeStock: 5, afterStock: 3, referenceType: "pos_adjustment", referenceId: "adjustment-1",
    }), tx);
    expect(deps.enqueueAuditEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
      eventType: "pos.inventory.adjusted", entityId: "adjustment-1", storeId: "store-1",
    }));
    expect(result).toMatchObject({ id: "adjustment-1", before_stock: 5, after_stock: 3, delta: -2 });
  });

  it("rejects a missing product or a variant from another product before inventory writes", async () => {
    const { deps } = dependencies();
    deps.validateProductVariant.mockResolvedValueOnce(null);
    await expect(adjustPosInventory({
      idempotency_key: "adjust-rel-1", store_id: "store-1", product_id: "product-1",
      variant_id: "variant-other", location_id: "warehouse-1", delta: 1, reason: "count",
      note: null, approval_token: "approval-token", operator,
    }, deps as never)).rejects.toMatchObject({ code: "PRODUCT_VARIANT_MISMATCH", status: 400 });
    expect(deps.insertInventory).not.toHaveBeenCalled();
    expect(deps.updateInventory).not.toHaveBeenCalled();
  });

  it("reselects the canonical row after a concurrent insert wins the inventory scope", async () => {
    const { deps } = dependencies();
    deps.lockInventory
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "inventory-winner", productId: "product-1", variantId: null, storeId: "store-1",
        warehouseId: "warehouse-1", stock: 4, lowStockThreshold: 2,
        productTitle: "Coffee", variantTitle: null, sku: null,
      });
    deps.insertInventory.mockResolvedValueOnce(false);
    const result = await adjustPosInventory({
      idempotency_key: "adjust-race-1", store_id: "store-1", product_id: "product-1",
      variant_id: null, location_id: "warehouse-1", delta: 1, reason: "count",
      note: null, approval_token: "approval-token", operator,
    }, deps as never);
    expect(deps.lockInventory).toHaveBeenCalledTimes(2);
    expect(deps.updateInventory).toHaveBeenCalledWith("inventory-winner", 5, expect.anything());
    expect(result).toMatchObject({ inventory_id: "inventory-winner", before_stock: 4, after_stock: 5 });
  });

  it("blocks negative inventory before any write", async () => {
    const { deps } = dependencies();
    await expect(adjustPosInventory({
      idempotency_key: "adjust-1", store_id: "store-1", product_id: "product-1",
      variant_id: null, location_id: "warehouse-1", delta: -6, reason: "damage",
      note: null, approval_token: "approval-token", operator,
    }, deps as never)).rejects.toMatchObject({ code: "INSUFFICIENT_INVENTORY", status: 409 });
    expect(deps.updateInventory).not.toHaveBeenCalled();
    expect(deps.insertInventoryTransaction).not.toHaveBeenCalled();
  });

  it("requires both the scoped permission and one-time approval", async () => {
    const { deps } = dependencies();
    await expect(listPosInventory({ operator: { ...operator, permissions: [] } }, deps as never))
      .rejects.toMatchObject({ code: "POS_PERMISSION_REQUIRED", status: 403 });
    await expect(adjustPosInventory({
      idempotency_key: "adjust-1", store_id: "store-1", product_id: "product-1",
      variant_id: null, location_id: "warehouse-1", delta: 1, reason: "count",
      note: null, approval_token: null, operator,
    }, deps as never)).rejects.toMatchObject({ code: "APPROVAL_REQUIRED", status: 403 });
    expect(deps.transaction).not.toHaveBeenCalled();
  });

  it("replays adjustment and transfer responses without repeating writes", async () => {
    const adjustment = { id: "existing-adjustment", after_stock: 9 };
    const transfer = {
      id: "existing-transfer", reference_no: "TF-OLD", status: "pending" as const,
      store_id: "store-1", from_location_id: "warehouse-1", to_location_id: "warehouse-2",
      operator_id: "staff-1", items: [],
    };
    const first = dependencies();
    first.deps.runIdempotent.mockResolvedValueOnce(adjustment);
    await expect(adjustPosInventory({
      idempotency_key: "adjust-1", store_id: "store-1", product_id: "product-1",
      variant_id: null, location_id: "warehouse-1", delta: 1, reason: "count",
      note: null, approval_token: "approval", operator,
    }, first.deps as never)).resolves.toBe(adjustment);
    expect(first.deps.transaction).not.toHaveBeenCalled();

    const second = dependencies();
    second.deps.runIdempotent.mockResolvedValueOnce(transfer);
    await expect(createPosInventoryTransfer({
      idempotency_key: "transfer-1", store_id: "store-1",
      from_location_id: "warehouse-1", to_location_id: "warehouse-2", note: null,
      items: [{ product_id: "product-1", variant_id: null, quantity: 2 }], operator,
    }, second.deps as never)).resolves.toBe(transfer);
    expect(second.deps.createTransfer).not.toHaveBeenCalled();
  });

  it("fails closed on forged store or an unbound location", async () => {
    const { deps } = dependencies();
    const base = {
      idempotency_key: "adjust-1", product_id: "product-1", variant_id: null,
      delta: 1, reason: "count" as const, note: null, approval_token: "approval-token", operator,
    };
    await expect(adjustPosInventory({ ...base, store_id: "store-2", location_id: "warehouse-1" }, deps as never))
      .rejects.toMatchObject({ code: "OPERATOR_STORE_MISMATCH", status: 403 });
    await expect(adjustPosInventory({ ...base, store_id: "store-1", location_id: "warehouse-2" }, deps as never))
      .rejects.toMatchObject({ code: "LOCATION_STORE_MISMATCH", status: 403 });
  });

  it("wraps the existing transfer service after validating source and destination", async () => {
    const { deps } = dependencies();
    const result = await createPosInventoryTransfer({
      idempotency_key: "transfer-1", store_id: "store-1",
      from_location_id: "warehouse-1", to_location_id: "warehouse-2", note: null,
      items: [{ product_id: "product-1", variant_id: null, quantity: 2 }], operator,
    }, deps as never);
    expect(deps.createTransfer).toHaveBeenCalledWith({
      storeId: "store-1",
      fromWarehouseId: "warehouse-1", toWarehouseId: "warehouse-2", note: undefined,
      operatorId: "staff-1", items: [{ productId: "product-1", variantId: undefined, quantity: 2 }],
    });
    expect(result).toEqual({
      id: "transfer-1", reference_no: "TF-1", status: "pending", store_id: "store-1",
      from_location_id: "warehouse-1", to_location_id: "warehouse-2", operator_id: "staff-1",
      items: [{ product_id: "product-1", variant_id: null, quantity: 2 }],
    });
  });

  it("fails closed when the transfer service acknowledgement changes requested facts", async () => {
    const { deps } = dependencies();
    deps.createTransfer.mockResolvedValueOnce({
      id: "transfer-1", referenceNo: "TF-1", status: "pending",
      storeId: "store-1", fromLocationId: "warehouse-1", toLocationId: "wrong-location", operatorId: "staff-1",
      items: [{ productId: "product-1", variantId: null, quantity: 2 }],
    });
    await expect(createPosInventoryTransfer({
      idempotency_key: "transfer-ack-1", store_id: "store-1",
      from_location_id: "warehouse-1", to_location_id: "warehouse-2", note: null,
      items: [{ product_id: "product-1", variant_id: null, quantity: 2 }], operator,
    }, deps as never)).rejects.toMatchObject({ code: "TRANSFER_ACK_INVALID", status: 502 });
  });
});
