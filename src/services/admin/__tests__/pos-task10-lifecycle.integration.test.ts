import { describe, expect, it, vi } from "vitest";

import { refundPosOrder } from "../refund-service";
import { posCheckout } from "../pos-service";
import { closeShift, openShift, reconcileCashEntries, recordCashMovement } from "../pos-shift-service";

const operator = {
  accountUserId: "user-1",
  staffId: "staff-1",
  storeId: "store-1",
  deviceId: "device-1",
  permissions: ["checkout", "refund"],
};

describe("Task 10 deterministic service lifecycle", () => {
  it("reconciles open -> cash/card sales -> ordinary cash refund -> cash in/out -> close from one detail ledger", async () => {
    const tx = { kind: "shared-transaction" };
    const state = {
      shift: null as null | Record<string, unknown>,
      movements: [] as Array<Record<string, unknown>>,
      orders: new Map<string, Record<string, unknown>>(),
      items: new Map<string, Record<string, unknown>>(),
      payments: [] as Array<{ orderId: string; method: string; amount: string; status: string }>,
      refunds: [] as Array<{ amount: string; orderPaymentMethod: string | null; isExchangeAccounting: boolean }>,
    };
    let id = 0;
    const nextId = () => `task10-${++id}`;
    const shiftDependencies = {
      transaction: async (work: (transaction: unknown) => Promise<unknown>) => work(tx),
      runIdempotent: async (_input: unknown, work: () => Promise<unknown>) => work(),
      lockStore: vi.fn().mockResolvedValue(true),
      findOpenShift: vi.fn(async () => state.shift?.status === "open" ? state.shift : null),
      getOpenShift: vi.fn(async () => state.shift?.status === "open" ? state.shift : null),
      lockShift: vi.fn(async (shiftId: string) => state.shift?.id === shiftId ? state.shift : null),
      insertShift: vi.fn(async (shift: Record<string, unknown>) => { state.shift = shift; }),
      findCashMovementByKey: vi.fn(async (key: string) => state.movements.find((row) => row.idempotencyKey === key) ?? null),
      insertCashMovement: vi.fn(async (movement: Record<string, unknown>) => { state.movements.push(movement); }),
      reconcileCash: vi.fn(async () => reconcileCashEntries({
        payments: state.payments.map(({ method, amount }) => ({ method, amount })),
        refunds: state.refunds,
        movements: state.movements.map((row) => ({ kind: String(row.kind), amount: String(row.amount) })),
      })),
      updateClosedShift: vi.fn(async (closed: Record<string, unknown>) => {
        state.shift = { ...state.shift, status: "closed", ...closed };
      }),
      enqueueAuditEvent: vi.fn().mockResolvedValue(undefined),
      newId: nextId,
      now: () => new Date("2026-07-18T10:00:00.000Z"),
    };

    const opened = await openShift({ opening_float: "100.00", operator }, shiftDependencies as never);
    const checkoutDependencies = {
      getStore: vi.fn().mockResolvedValue({
        id: "store-1", name: "Main", status: "active", currency: "USD", taxRateBps: 0,
        pricingVersion: "pricing-v1", paymentMethods: ["cash", "card"],
      }),
      validateFulfillment: (value: unknown) => value,
      priceOrder: vi.fn().mockResolvedValue({
        lines: [{
          productId: "product-1", variantId: null, title: "Product", productType: "physical", sku: "SKU-1",
          unitPrice: "25.00", quantity: 1, lineDiscount: "0.00", lineTotal: "25.00",
        }],
        subtotal: "25.00", lineDiscountTotal: "0.00", orderDiscount: "0.00", tax: "0.00", total: "25.00",
      }),
      runIdempotent: async (_input: unknown, work: () => Promise<unknown>) => work(),
      transaction: async (work: (transaction: unknown) => Promise<unknown>) => work(tx),
      findOpenShiftId: vi.fn().mockResolvedValue(opened.id),
      insertOrder: vi.fn(async (order: Record<string, unknown>) => { state.orders.set(String(order.id), order); }),
      insertOrderItem: vi.fn(async (item: Record<string, unknown>) => { state.items.set(String(item.id), item); }),
      allocateInventory: vi.fn().mockResolvedValue(undefined),
      recordOrderPayment: vi.fn(async (payment: { orderId: string; method: string; amount: string; status: string }) => {
        state.payments.push(payment);
        return { ...payment, id: nextId(), createdAt: new Date("2026-07-18T10:00:00.000Z") };
      }),
      insertTimeline: vi.fn().mockResolvedValue(undefined),
      enqueueAuditEvent: vi.fn().mockResolvedValue(undefined),
      newId: nextId,
      newOrderNo: () => `POS-${nextId()}`,
      now: () => new Date("2026-07-18T10:00:00.000Z"),
    };
    const checkout = (key: string, method: "cash" | "card") => posCheckout({
      idempotency_key: key,
      store_id: "store-1",
      currency: "USD",
      staff_id: "staff-1",
      customer_id: null,
      note: null,
      fulfillment: { method: "in_store" as const },
      items: [{ product_id: "product-1", variant_id: null, quantity: 1, line_discount: "0.00" }],
      order_discount: "0.00",
      pricing_preview: { subtotal: "25.00", discount: "0.00", tax: "0.00", total: "25.00" },
      pricing_version: "pricing-v1",
      payments: [{ method, label: method, amount: "25.00", reference: null }],
      account_user_id: "user-1",
      operator,
    }, checkoutDependencies as never);

    const cashSale = await checkout("cash-sale", "cash");
    const cardSale = await checkout("card-sale", "card");
    const cashItem = cashSale.items[0];
    const refundDependencies = {
      runIdempotent: async (_input: unknown, work: () => Promise<unknown>) => work(),
      transaction: async (work: (transaction: unknown) => Promise<unknown>) => work(tx),
      findOpenShiftId: vi.fn().mockResolvedValue(opened.id),
      consumeApprovalToken: vi.fn().mockResolvedValue("manager-1"),
      lockOriginalOrder: vi.fn(async () => ({
        id: cashSale.id, storeId: "store-1", source: "pos", status: "completed", total: "25.00",
        refundedTotal: "0.00", currency: "USD",
      })),
      lockOriginalItems: vi.fn(async () => [{
        id: cashItem.id, productId: "product-1", variantId: null, productType: "physical", title: "Product",
        quantity: 1, unitPrice: "25.00", subtotal: "25.00",
      }]),
      getReturnedQuantities: vi.fn().mockResolvedValue(new Map()),
      restockReturn: vi.fn().mockResolvedValue(undefined),
      insertRefund: vi.fn(async (refund: { amount: string }) => {
        state.refunds.push({ amount: refund.amount, orderPaymentMethod: "cash", isExchangeAccounting: false });
        return "refund-1";
      }),
      insertReturnItem: vi.fn().mockResolvedValue(undefined),
      updateOriginalOrder: vi.fn().mockResolvedValue(undefined),
      insertTimeline: vi.fn().mockResolvedValue(undefined),
      enqueueAuditEvent: vi.fn().mockResolvedValue(undefined),
      newId: nextId,
      now: () => new Date("2026-07-18T10:30:00.000Z"),
    };
    await refundPosOrder({
      idempotency_key: "cash-refund", store_id: "store-1", order_id: cashSale.id,
      return_items: [{ order_item_id: cashItem.id, quantity: 1, restock: true }], reason: "ordinary cash refund",
      approval_token: "approval", account_user_id: "user-1", operator,
    }, refundDependencies as never);
    await recordCashMovement({
      shift_id: opened.id, kind: "in", amount: "20.00", reason: "cash in", idempotency_key: "cash-in", operator,
    }, shiftDependencies as never);
    await recordCashMovement({
      shift_id: opened.id, kind: "out", amount: "5.00", reason: "cash out", idempotency_key: "cash-out", operator,
    }, shiftDependencies as never);
    const closed = await closeShift({
      shift_id: opened.id, counted_cash: "115.00", idempotency_key: "close", operator,
    }, shiftDependencies as never);

    expect({ cashSale: cashSale.id, cardSale: cardSale.id, refundCount: state.refunds.length, movementCount: state.movements.length })
      .toEqual({ cashSale: expect.any(String), cardSale: expect.any(String), refundCount: 1, movementCount: 2 });
    expect(closed).toMatchObject({
      expected_cash: "115.00",
      counted_cash: "115.00",
      difference_cash: "0.00",
      reconciliation: { cash_sales: "25.00", cash_refunds: "25.00", cash_in: "20.00", cash_out: "5.00" },
    });
  });
});
