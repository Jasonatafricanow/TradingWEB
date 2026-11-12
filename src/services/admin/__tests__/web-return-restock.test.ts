import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), restore: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/services/inventory/inventory-allocation-service", () => ({ restoreInventory: mocks.restore }));
import { restockWebRefund } from "../refund-service";
function setup(restocked = false, priorQuantity = 0) {
  const refund = { id: "r", order_id: "o", status: "completed", restocked };
  const reads: unknown[][] = [[refund], [{ id: "o", source: "web", store_id: null }], [refund], restocked ? [{ order_item_id: "i", quantity: 1 }] : [], [{ id: "i", product_id: "p", product_type: "physical", quantity: 2, variant_id: null, product_title: "Item" }], priorQuantity ? [{ orderItemId: "i", quantity: priorQuantity }] : []];
  const inserts = vi.fn(); const updates = vi.fn();
  const tx = {
    select: () => { const result = reads.shift(); const q = { from: () => q, where: () => q, for: () => q, limit: () => q, groupBy: () => q, then: (resolve: Function) => Promise.resolve(resolve(result)) }; return q; },
    insert: () => ({ values: inserts }), update: () => ({ set: (value: unknown) => { updates(value); return { where: async () => {} }; } }),
  };
  mocks.transaction.mockImplementation(work => work(tx));
  return { tx, inserts, updates };
}
beforeEach(() => vi.clearAllMocks());
describe("Web physical returns", () => {
  it("restores verified quantities against the original order without changing payment state", async () => {
    const { tx, inserts, updates } = setup();
    await restockWebRefund("r", "admin", [{ order_item_id: "i", quantity: 1 }]);
    expect(mocks.restore).toHaveBeenCalledWith(expect.objectContaining({ originalOrderId: "o", referenceId: "r", lines: [expect.objectContaining({ quantity: 1, productId: "p" })] }), undefined, tx);
    expect(updates).toHaveBeenCalledWith({ restocked: true });
    expect(inserts).toHaveBeenCalledWith(expect.objectContaining({ refund_id: "r", order_item_id: "i", quantity: 1 }));
  });
  it("replays the same receipt without stock writes and rejects changed lines", async () => {
    setup(true);
    await restockWebRefund("r", "admin", [{ order_item_id: "i", quantity: 1 }]);
    expect(mocks.restore).not.toHaveBeenCalled();
    setup(true);
    await expect(restockWebRefund("r", "admin", [{ order_item_id: "i", quantity: 2 }])).rejects.toMatchObject({ code: "RETURN_ALREADY_RECORDED" });
  });
  it("rejects cumulative excess and duplicate lines before stock writes", async () => {
    setup(false, 2);
    await expect(restockWebRefund("r", "admin", [{ order_item_id: "i", quantity: 1 }])).rejects.toMatchObject({ code: "RETURN_QUANTITY_EXCEEDED" });
    await expect(restockWebRefund("r", "admin", [{ order_item_id: "i", quantity: 1 }, { order_item_id: "i", quantity: 1 }])).rejects.toMatchObject({ code: "INVALID_RETURN_ITEMS" });
    expect(mocks.restore).not.toHaveBeenCalled();
  });
});
