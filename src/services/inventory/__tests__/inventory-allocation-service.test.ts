import { describe, expect, it } from "vitest";

import {
  allocateInventory,
  restoreInventory,
  type InventoryAllocationRepository,
  type InventoryLedgerRow,
  type InventoryTransactionInput,
} from "../inventory-allocation-service";

function fakeRepository(seed: {
  rows?: InventoryLedgerRow[];
} = {}) {
  const state = {
    rows: (seed.rows ?? []).map((row) => ({ ...row })),
    transactions: [] as InventoryTransactionInput[],
  };
  const repository: InventoryAllocationRepository = {
    lockInventoryRows: async () => state.rows,
    setInventoryRowStock: async (id, stock) => {
      const row = state.rows.find((entry) => entry.id === id);
      if (!row) throw new Error("ROW_NOT_FOUND");
      row.stock = stock;
    },
    insertTransaction: async (entry) => {
      state.transactions.push(entry);
    },
  };
  return { repository, state };
}

const baseInput = {
  storeId: "store-a",
  operatorId: "staff-a",
  referenceType: "order",
  referenceId: "order-a",
  note: "POS sale",
};

describe("allocateInventory", () => {
  it("deducts store rows before unassigned rows and excludes other stores", async () => {
    const { repository, state } = fakeRepository({
      rows: [
        { id: "other", storeId: "store-b", stock: 50 },
        { id: "shared", storeId: null, stock: 4 },
        { id: "local", storeId: "store-a", stock: 10 },
      ],
    });

    const result = await allocateInventory({
      ...baseInput,
      lines: [{ productId: "p1", variantId: null, productType: "physical", title: "Plain", quantity: 12 }],
    }, repository, {} as never);

    expect(state.rows).toEqual([
      { id: "other", storeId: "store-b", stock: 50 },
      { id: "shared", storeId: null, stock: 2 },
      { id: "local", storeId: "store-a", stock: 0 },
    ]);
    expect(result[0]).toMatchObject({ beforeStock: 14, afterStock: 2 });
    expect(state.transactions).toHaveLength(1);
  });

  it("uses only scoped inventory rows for variant checkout", async () => {
    const { repository, state } = fakeRepository({
      rows: [{ id: "local", storeId: "store-a", stock: 5 }],
    });

    await allocateInventory({
      ...baseInput,
      lines: [{ productId: "p1", variantId: "v1", productType: "physical", title: "Variant", quantity: 2 }],
    }, repository, {} as never);

    expect(state.rows[0].stock).toBe(3);
  });

  it("fails closed when a variant has no inventory row", async () => {
    const { repository } = fakeRepository({ rows: [] });

    await expect(allocateInventory({
      ...baseInput,
      lines: [{ productId: "p1", variantId: "v1", productType: "physical", title: "Legacy", quantity: 2 }],
    }, repository, {} as never)).rejects.toMatchObject({ code: "INSUFFICIENT_INVENTORY" });
  });

  it("rejects insufficient local inventory without writing", async () => {
    const { repository, state } = fakeRepository({
      rows: [
        { id: "local", storeId: "store-a", stock: 1 },
        { id: "other", storeId: "store-b", stock: 99 },
      ],
    });

    await expect(allocateInventory({
      ...baseInput,
      lines: [{ productId: "p1", variantId: null, productType: "physical", title: "Plain", quantity: 2 }],
    }, repository, {} as never)).rejects.toMatchObject({ code: "INSUFFICIENT_INVENTORY" });
    expect(state.rows[0].stock).toBe(1);
    expect(state.transactions).toHaveLength(0);
  });

  it("does not allocate inventory for non-physical lines", async () => {
    const { repository, state } = fakeRepository();
    const result = await allocateInventory({
      ...baseInput,
      lines: [{ productId: "p1", variantId: null, productType: "service", title: "Consulting", quantity: 1 }],
    }, repository, {} as never);
    expect(result).toEqual([]);
    expect(state.transactions).toEqual([]);
  });

  it("makes a Web sale immediately visible to POS availability", async () => {
    const { repository, state } = fakeRepository({
      rows: [
        { id: "local", storeId: "store-a", stock: 5 },
        { id: "shared", storeId: null, stock: 3 },
      ],
    });

    await allocateInventory({
      ...baseInput,
      storeId: null,
      referenceType: "web_order",
      lines: [{ productId: "p1", variantId: "v1", productType: "physical", title: "Variant", quantity: 4 }],
    }, repository, {} as never);

    const posAvailable = state.rows
      .filter((row) => row.storeId === "store-a" || row.storeId === null)
      .reduce((sum, row) => sum + row.stock, 0);
    expect(posAvailable).toBe(4);
  });

  it("makes a POS sale immediately visible to Web availability", async () => {
    const { repository, state } = fakeRepository({
      rows: [
        { id: "local", storeId: "store-a", stock: 5 },
        { id: "other", storeId: "store-b", stock: 7 },
      ],
    });

    await allocateInventory({
      ...baseInput,
      lines: [{ productId: "p1", variantId: null, productType: "physical", title: "Plain", quantity: 2 }],
    }, repository, {} as never);

    expect(state.rows.reduce((sum, row) => sum + row.stock, 0)).toBe(10);
  });

  it("restores sale stock through the same inventory ledger for refunds and cancellations", async () => {
    const { repository, state } = fakeRepository({
      rows: [{ id: "local", storeId: "store-a", stock: 5 }],
    });
    const line = { productId: "p1", variantId: "v1", productType: "physical", title: "Variant", quantity: 2 };

    await allocateInventory({ ...baseInput, lines: [line] }, repository, {} as never);
    await restoreInventory({
      ...baseInput,
      referenceType: "refund",
      referenceId: "refund-a",
      note: "POS refund",
      lines: [line],
    }, repository, {} as never);

    expect(state.rows[0].stock).toBe(5);
    expect(state.transactions.map((entry) => entry.type)).toEqual(["out", "in"]);
  });
});
