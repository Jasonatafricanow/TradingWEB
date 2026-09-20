import { beforeEach, describe, expect, it, vi } from "vitest";

import { exchangePosOrder } from "../pos-exchange-service";

function request() {
  return {
    idempotency_key: "exchange-001",
    store_id: "store-1",
    original_order_id: "order-old",
    return_items: [{ order_item_id: "old-item", quantity: 1, restock: true }],
    replacement: {
      idempotency_key: "replacement-001",
      store_id: "store-1",
      currency: "USD",
      staff_id: "staff-1",
      customer_id: null,
      note: null,
      fulfillment: { method: "in_store" as const },
      items: [{ product_id: "new-product", variant_id: null, quantity: 1, line_discount: "0.00" }],
      order_discount: "0.00",
      pricing_preview: { subtotal: "12.00", discount: "0.00", tax: "0.00", total: "12.00" },
      pricing_version: "pricing-v1",
      payments: [{ method: "cash", label: "Cash", amount: "12.00", reference: null }],
    },
    difference_payment: [{ method: "cash", label: "Cash", amount: "2.00", reference: null }],
    approval_token: "approval-token",
    account_user_id: "user-1",
    operator: {
      accountUserId: "user-1",
      staffId: "staff-1",
      storeId: "store-1",
      deviceId: "device-1",
      permissions: ["exchange"],
    },
  };
}

function dependencies() {
  const events: string[] = [];
  const tx = { tx: true };
  const replacement = {
    id: "order-new", order_no: "POS-NEW", created_at: "2026-07-17T00:00:00.000Z", source: "pos" as const,
    status: "completed", financial_status: "paid", fulfillment_status: "fulfilled",
    subtotal: "12.00", discount_total: "0.00", tax_total: "0.00", total: "12.00", refunded_total: "0.00",
    items: [], payments: [{ method: "cash", label: "Cash", amount: "2.00", reference: null }],
  };
  const deps = {
    runIdempotent: vi.fn(async (_key, work) => work()),
    transaction: vi.fn(async (work) => work(tx)),
    findOpenShiftId: vi.fn().mockResolvedValue("shift-1"),
    getStore: vi.fn().mockResolvedValue({ id: "store-1", name: "Main", status: "active", currency: "USD", taxRateBps: 0, pricingVersion: "pricing-v1", paymentMethods: ["cash"] }),
    consumeApprovalToken: vi.fn(async () => { events.push("approval"); return "manager-1"; }),
    lockOriginalOrder: vi.fn(async () => { events.push("order-lock"); return { id: "order-old", storeId: "store-1", source: "pos", status: "completed", total: "10.00", refundedTotal: "0.00", currency: "USD" }; }),
    lockOriginalItems: vi.fn(async () => { events.push("item-lock"); return [{ id: "old-item", productId: "old-product", variantId: null, productType: "physical", title: "Old", quantity: 1, unitPrice: "10.00", subtotal: "10.00" }]; }),
    getReturnedQuantities: vi.fn().mockResolvedValue(new Map()),
    priceReplacement: vi.fn().mockResolvedValue({ lines: [], subtotal: "12.00", lineDiscountTotal: "0.00", orderDiscount: "0.00", tax: "0.00", total: "12.00" }),
    restockReturn: vi.fn(async () => { events.push("restock"); }),
    createReplacement: vi.fn(async () => { events.push("replacement"); return replacement; }),
    allocateReplacement: vi.fn(async () => { events.push("deduct"); }),
    recordDifferencePayment: vi.fn(async () => { events.push("payment"); }),
    insertRefund: vi.fn(async () => { events.push("refund"); return "refund-1"; }),
    insertExchange: vi.fn(async () => { events.push("exchange"); }),
    insertReturnItem: vi.fn(async () => { events.push("return-item"); }),
    updateOriginalOrder: vi.fn(async () => { events.push("update-old"); }),
    insertTimeline: vi.fn(async () => { events.push("timeline"); }),
    enqueueAuditEvent: vi.fn(async () => { events.push("outbox"); }),
    newId: vi.fn()
      .mockReturnValueOnce("exchange-row-1")
      .mockReturnValueOnce("refund-row-1")
      .mockReturnValue("line-row-1"),
    now: vi.fn().mockReturnValue(new Date("2026-07-17T00:00:00.000Z")),
  };
  return { deps, events, tx, replacement };
}

beforeEach(() => vi.clearAllMocks());

describe("exchangePosOrder", () => {
  it("executes approval, locks, return, replacement, stock, payments and facts in one transaction", async () => {
    const { deps, events, tx } = dependencies();
    const result = await exchangePosOrder(request(), deps as never);

    expect(deps.runIdempotent).toHaveBeenCalledWith(expect.objectContaining({ operation: "exchange", key: "exchange-001" }), expect.any(Function), expect.objectContaining({ responseStatus: 201 }));
    expect(deps.consumeApprovalToken).toHaveBeenCalledWith("approval-token", "exchange", expect.stringMatching(/^[a-f0-9]{64}$/), "store-1", tx);
    expect(deps.createReplacement).toHaveBeenCalledWith(expect.objectContaining({ shiftId: "shift-1" }), tx);
    expect(deps.insertRefund).toHaveBeenCalledWith(expect.objectContaining({ shiftId: "shift-1" }), tx);
    expect(deps.insertExchange).toHaveBeenCalledWith(expect.objectContaining({
      id: "exchange-row-1", refundId: "refund-row-1",
    }), tx);
    expect(deps.enqueueAuditEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
      eventType: "pos.exchange.completed", entityType: "exchange", entityId: "exchange-row-1", storeId: "store-1",
    }));
    expect(events).toEqual(["approval", "order-lock", "item-lock", "restock", "replacement", "deduct", "payment", "refund", "exchange", "return-item", "update-old", "timeline", "timeline", "outbox"]);
    expect(result).toMatchObject({ exchange_id: "exchange-row-1", refund_amount: "10.00", new_order_amount: "12.00", difference_amount: "2.00", replacement_order: { id: "order-new" } });
  });

  it("rejects a duplicate returned quantity before any stock or order write", async () => {
    const { deps } = dependencies();
    deps.getReturnedQuantities.mockResolvedValueOnce(new Map([["old-item", 1]]));
    await expect(exchangePosOrder(request(), deps as never)).rejects.toMatchObject({ code: "RETURN_QUANTITY_EXCEEDED", status: 409 });
    expect(deps.restockReturn).not.toHaveBeenCalled();
    expect(deps.createReplacement).not.toHaveBeenCalled();
  });

  it("propagates insufficient replacement stock so the transaction can roll everything back", async () => {
    const { deps } = dependencies();
    deps.allocateReplacement.mockRejectedValueOnce(Object.assign(new Error("stock"), { code: "INSUFFICIENT_INVENTORY" }));
    await expect(exchangePosOrder(request(), deps as never)).rejects.toMatchObject({ code: "INSUFFICIENT_INVENTORY" });
    expect(deps.insertRefund).not.toHaveBeenCalled();
    expect(deps.insertExchange).not.toHaveBeenCalled();
  });

  it("rolls back the return stock and half-created replacement when replacement inventory is insufficient", async () => {
    const { deps } = dependencies();
    const state = { refundedTotal: "0.00", orders: 0, returnedStock: 4, newStock: 0, exchanges: 0 };
    deps.transaction.mockImplementationOnce(async (work) => {
      const before = { ...state };
      try {
        return await work({ tx: true });
      } catch (error) {
        Object.assign(state, before);
        throw error;
      }
    });
    deps.restockReturn.mockImplementationOnce(async () => { state.returnedStock += 1; });
    deps.createReplacement.mockImplementationOnce(async () => {
      state.orders += 1;
      return dependencies().replacement;
    });
    deps.allocateReplacement.mockImplementationOnce(async () => {
      throw Object.assign(new Error("stock"), { code: "INSUFFICIENT_INVENTORY" });
    });
    await expect(exchangePosOrder(request(), deps as never)).rejects.toMatchObject({ code: "INSUFFICIENT_INVENTORY" });
    expect(state).toEqual({ refundedTotal: "0.00", orders: 0, returnedStock: 4, newStock: 0, exchanges: 0 });
  });

  it("returns an idempotent response-loss replay without opening a transaction", async () => {
    const { deps, replacement } = dependencies();
    const replay = { exchange_id: "existing", original_order_id: "order-old", replacement_order: replacement, refund_amount: "10.00", new_order_amount: "12.00", difference_amount: "2.00" };
    deps.runIdempotent.mockResolvedValueOnce(replay);
    await expect(exchangePosOrder(request(), deps as never)).resolves.toBe(replay);
    expect(deps.transaction).not.toHaveBeenCalled();
  });
});
