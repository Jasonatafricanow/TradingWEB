import { beforeEach, describe, expect, it, vi } from "vitest";

import { refundPosOrder } from "../refund-service";

function request() {
  return {
    idempotency_key: "refund-001",
    store_id: "store-1",
    order_id: "order-old",
    return_items: [{ order_item_id: "old-item", quantity: 1, restock: true }],
    reason: "Customer return",
    approval_token: "approval-token",
    account_user_id: "user-1",
    operator: {
      accountUserId: "user-1",
      staffId: "staff-1",
      storeId: "store-1",
      deviceId: "device-1",
      permissions: ["refund"],
    },
  };
}

function dependencies() {
  const events: string[] = [];
  const tx = { tx: true };
  const deps = {
    runIdempotent: vi.fn(async (_key, work) => work()),
    transaction: vi.fn(async (work) => work(tx)),
    findOpenShiftId: vi.fn().mockResolvedValue("shift-1"),
    consumeApprovalToken: vi.fn(async () => { events.push("approval"); return "manager-1"; }),
    lockOriginalOrder: vi.fn(async () => { events.push("order-lock"); return {
      id: "order-old", storeId: "store-1", source: "pos", status: "completed",
      total: "10.00", refundedTotal: "0.00", currency: "USD",
    }; }),
    lockOriginalItems: vi.fn(async () => { events.push("item-lock"); return [{
      id: "old-item", productId: "old-product", variantId: null, productType: "physical",
      title: "Old", quantity: 1, unitPrice: "10.00", subtotal: "10.00",
    }]; }),
    getReturnedQuantities: vi.fn().mockResolvedValue(new Map()),
    restockReturn: vi.fn(async () => { events.push("restock"); }),
    insertRefund: vi.fn(async () => { events.push("refund"); return "refund-1"; }),
    insertReturnItem: vi.fn(async () => { events.push("return-item"); }),
    updateOriginalOrder: vi.fn(async () => { events.push("update-old"); }),
    insertTimeline: vi.fn(async () => { events.push("timeline"); }),
    enqueueAuditEvent: vi.fn(async () => { events.push("outbox"); }),
    newId: vi.fn().mockReturnValue("refund-1"),
    now: vi.fn().mockReturnValue(new Date("2026-07-17T00:00:00.000Z")),
  };
  return { deps, events, tx };
}

beforeEach(() => vi.clearAllMocks());

describe("refundPosOrder", () => {
  it("consumes approval and writes the immutable line ledger in one transaction", async () => {
    const { deps, events, tx } = dependencies();
    const result = await refundPosOrder(request(), deps as never);

    expect(deps.runIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "refund", key: "refund-001" }),
      expect.any(Function),
      expect.objectContaining({ responseStatus: 201 }),
    );
    expect(deps.consumeApprovalToken).toHaveBeenCalledWith(
      "approval-token", "refund", expect.stringMatching(/^[a-f0-9]{64}$/), "store-1", tx,
    );
    expect(deps.insertRefund).toHaveBeenCalledWith(expect.objectContaining({ shiftId: "shift-1" }), tx);
    expect(deps.enqueueAuditEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
      eventType: "pos.refund.completed", entityType: "refund", entityId: "refund-1", storeId: "store-1",
    }));
    expect(events).toEqual(["approval", "order-lock", "item-lock", "restock", "refund", "return-item", "update-old", "timeline", "outbox"]);
    expect(result).toMatchObject({ refund_id: "refund-1", order_id: "order-old", amount: "10.00", refunded_total: "10.00" });
  });

  it("blocks quantities already present in pos_refund_items", async () => {
    const { deps } = dependencies();
    deps.getReturnedQuantities.mockResolvedValueOnce(new Map([["old-item", 1]]));
    await expect(refundPosOrder(request(), deps as never)).rejects.toMatchObject({ code: "RETURN_QUANTITY_EXCEEDED", status: 409 });
    expect(deps.restockReturn).not.toHaveBeenCalled();
    expect(deps.insertRefund).not.toHaveBeenCalled();
  });

  it("replays a completed response without opening a new transaction", async () => {
    const { deps } = dependencies();
    const replay = { refund_id: "existing", order_id: "order-old", amount: "10.00", refunded_total: "10.00" };
    deps.runIdempotent.mockResolvedValueOnce(replay);
    await expect(refundPosOrder(request(), deps as never)).resolves.toBe(replay);
    expect(deps.transaction).not.toHaveBeenCalled();
  });

  it("rejects forged operator identity before idempotency reservation", async () => {
    const { deps } = dependencies();
    await expect(refundPosOrder({ ...request(), store_id: "store-2" }, deps as never)).rejects.toMatchObject({
      code: "OPERATOR_MISMATCH", status: 403,
    });
    expect(deps.runIdempotent).not.toHaveBeenCalled();
  });
});
