import { describe, expect, it, vi } from "vitest";

import {
  approveTransfer,
  cancelTransfer,
  completeTransfer,
  createTransfer,
  type TransferDependencies,
  type TransferHeader,
} from "../transfer-service";

function dependencies() {
  const tx = { tx: true } as never;
  let tail = Promise.resolve();
  const headers = new Map<string, TransferHeader>();
  const items = new Map<string, Array<{ productId: string; variantId: string | null; quantity: number; unitCost: number | null }>>();
  const inventory = new Map<string, { id: string; stock: number }>([["store-1|warehouse-1|product-1|", { id: "source-stock", stock: 5 }]]);
  const key = (target: { storeId: string | null; warehouseId: string; productId: string; variantId: string | null }) =>
    `${target.storeId ?? ""}|${target.warehouseId}|${target.productId}|${target.variantId ?? ""}`;
  const snapshot = () => ({
    headers: structuredClone([...headers]),
    items: structuredClone([...items]),
    inventory: structuredClone([...inventory]),
  });
  const restore = (state: ReturnType<typeof snapshot>) => {
    headers.clear(); state.headers.forEach(([id, value]) => headers.set(id, value));
    items.clear(); state.items.forEach(([id, value]) => items.set(id, value));
    inventory.clear(); state.inventory.forEach(([id, value]) => inventory.set(id, value));
  };
  const deps: TransferDependencies = {
    transaction: vi.fn((work) => {
      const run = tail.then(async () => {
        const before = snapshot();
        try { return await work(tx); }
        catch (error) { restore(before); throw error; }
      });
      tail = run.then(() => undefined, () => undefined);
      return run;
    }),
    validateWarehouse: vi.fn().mockResolvedValue(true),
    resolveStoreIdForWarehouse: vi.fn(async (warehouseId) => warehouseId === "warehouse-1" ? "store-1" : "store-2"),
    validateProductVariant: vi.fn().mockResolvedValue(true),
    lockInventory: vi.fn(async (target) => inventory.get(key(target)) ?? null),
    insertInventory: vi.fn(async (input) => {
      const scope = key(input);
      if (inventory.has(scope)) return false;
      inventory.set(scope, { id: input.id, stock: input.stock });
      return true;
    }),
    updateInventory: vi.fn(async (id, stock) => {
      const row = [...inventory.values()].find((entry) => entry.id === id);
      if (!row) throw new Error("inventory missing");
      row.stock = stock;
    }),
    insertInventoryTransaction: vi.fn().mockResolvedValue(undefined),
    insertTransfer: vi.fn(async (header) => { headers.set(header.id, { ...header }); }),
    insertItems: vi.fn(async (transferId, rows) => { items.set(transferId, structuredClone(rows)); }),
    lockTransfer: vi.fn(async (id) => headers.get(id) ?? null),
    listItems: vi.fn(async (id) => items.get(id) ?? []),
    transitionTransfer: vi.fn(async (id, expected, patch) => {
      const header = headers.get(id);
      if (!header || header.status !== expected) return false;
      headers.set(id, { ...header, ...patch });
      return true;
    }),
    enqueueAuditEvent: vi.fn().mockResolvedValue(undefined),
    newId: vi.fn()
      .mockReturnValueOnce("transfer-1")
      .mockReturnValueOnce("item-1")
      .mockReturnValueOnce("ledger-1")
      .mockReturnValue("generated-id"),
    newReferenceNo: vi.fn().mockReturnValue("TF-20260721-ABC12345"),
    now: vi.fn().mockReturnValue(new Date("2026-07-21T08:00:00.000Z")),
  };
  return { deps, headers, items, inventory, tx };
}

const createInput = {
  storeId: "store-1",
  fromWarehouseId: "warehouse-1",
  toWarehouseId: "warehouse-2",
  operatorId: "staff-1",
  items: [{ productId: "product-1", variantId: null, quantity: 2 }],
};

describe("transfer service transaction boundary", () => {
  it("validates product/variant relationships before inserting the transfer", async () => {
    const { deps } = dependencies();
    vi.mocked(deps.validateProductVariant).mockResolvedValueOnce(false);
    await expect(createTransfer({ ...createInput, items: [{ productId: "product-1", variantId: "other", quantity: 2 }] }, deps))
      .rejects.toMatchObject({ code: "PRODUCT_VARIANT_MISMATCH", status: 400 });
    expect(deps.insertTransfer).not.toHaveBeenCalled();
  });

  it("creates and audits a complete pending acknowledgement in one transaction", async () => {
    const { deps, tx } = dependencies();
    const result = await createTransfer(createInput, deps);
    expect(deps.transaction).toHaveBeenCalledTimes(1);
    expect(deps.enqueueAuditEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
      eventType: "inventory.transfer.created", entityId: "transfer-1",
    }));
    expect(result).toEqual({
      id: "transfer-1", referenceNo: "TF-20260721-ABC12345", status: "pending",
      storeId: "store-1", fromLocationId: "warehouse-1", toLocationId: "warehouse-2",
      operatorId: "staff-1", items: [{ productId: "product-1", variantId: null, quantity: 2 }],
    });
  });

  it("serializes concurrent approval so stock is deducted exactly once", async () => {
    const { deps, inventory } = dependencies();
    await createTransfer(createInput, deps);
    const results = await Promise.allSettled([
      approveTransfer("transfer-1", "manager-1", deps),
      approveTransfer("transfer-1", "manager-2", deps),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected?.reason).toMatchObject({ code: "TRANSFER_STATE_CONFLICT", status: 409 });
    expect(inventory.get("store-1|warehouse-1|product-1|")?.stock).toBe(3);
    expect(deps.insertInventoryTransaction).toHaveBeenCalledTimes(1);
  });

  it("rolls back stock and status when inventory journaling fails", async () => {
    const { deps, headers, inventory } = dependencies();
    await createTransfer(createInput, deps);
    vi.mocked(deps.insertInventoryTransaction).mockRejectedValueOnce(new Error("ledger unavailable"));
    await expect(approveTransfer("transfer-1", "manager-1", deps)).rejects.toThrow("ledger unavailable");
    expect(inventory.get("store-1|warehouse-1|product-1|")?.stock).toBe(5);
    expect(headers.get("transfer-1")?.status).toBe("pending");
  });

  it("reselects a conflict-safe destination row and completes atomically", async () => {
    const { deps, headers, inventory } = dependencies();
    await createTransfer(createInput, deps);
    await approveTransfer("transfer-1", "manager-1", deps);
    vi.mocked(deps.insertInventory).mockImplementationOnce(async (input) => {
      inventory.set("store-2|warehouse-2|product-1|", { id: "destination-winner", stock: 4 });
      return false;
    });
    await completeTransfer("transfer-1", "receiver-1", deps);
    expect(inventory.get("store-2|warehouse-2|product-1|")?.stock).toBe(6);
    expect(headers.get("transfer-1")?.status).toBe("completed");
    expect(deps.enqueueAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: "inventory.transfer.completed",
    }));
  });

  it("serializes concurrent cancellation and emits the audit event exactly once", async () => {
    const { deps, headers } = dependencies();
    await createTransfer(createInput, deps);
    vi.mocked(deps.enqueueAuditEvent).mockClear();

    const results = await Promise.allSettled([
      cancelTransfer("transfer-1", "manager-1", deps),
      cancelTransfer("transfer-1", "manager-2", deps),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected?.reason).toMatchObject({ code: "TRANSFER_STATE_CONFLICT", status: 409 });
    expect(headers.get("transfer-1")?.status).toBe("cancelled");
    expect(deps.enqueueAuditEvent).toHaveBeenCalledTimes(1);
    expect(deps.enqueueAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: "inventory.transfer.cancelled",
    }));
  });

  it("rolls back an in-transit cancellation when the return journal fails", async () => {
    const { deps, headers, inventory } = dependencies();
    await createTransfer(createInput, deps);
    await approveTransfer("transfer-1", "manager-1", deps);
    vi.mocked(deps.insertInventoryTransaction).mockRejectedValueOnce(new Error("ledger unavailable"));

    await expect(cancelTransfer("transfer-1", "manager-1", deps)).rejects.toThrow("ledger unavailable");

    expect(headers.get("transfer-1")?.status).toBe("in_transit");
    expect(inventory.get("store-1|warehouse-1|product-1|")?.stock).toBe(3);
  });
});
