import { beforeEach, describe, expect, it, vi } from "vitest";

import { posCheckout } from "../pos-service";

function checkoutInput() {
  return {
    idempotency_key: "android-checkout-001",
    store_id: "store-1",
    currency: "USD",
    staff_id: "staff-1",
    customer_id: null,
    note: null,
    fulfillment: { method: "in_store" as const },
    items: [{ product_id: "product-1", variant_id: null, quantity: 2, line_discount: "1.00" }],
    order_discount: "2.00",
    pricing_preview: { subtotal: "20.00", discount: "3.00", tax: "0.00", total: "17.00" },
    pricing_version: "pricing-v1",
    payments: [
      { method: "cash", label: "Cash", amount: "7.00", reference: null },
      { method: "card", label: "Card", amount: "10.00", reference: "TERM-1" },
    ],
    account_user_id: "user-1",
    operator: {
      accountUserId: "user-1",
      staffId: "staff-1",
      storeId: "store-1",
      deviceId: "android-install-1",
      permissions: ["checkout"],
    },
  };
}

function dependencies() {
  const events: string[] = [];
  const tx = { kind: "tx" };
  const deps = {
    getStore: vi.fn().mockResolvedValue({
      id: "store-1",
      name: "Main Store",
      status: "active",
      currency: "USD",
      taxRateBps: 0,
      pricingVersion: "pricing-v1",
      paymentMethods: ["cash", "card"],
    }),
    validateFulfillment: vi.fn((value) => value),
    priceOrder: vi.fn().mockResolvedValue({
      lines: [{
        productId: "product-1",
        variantId: null,
        title: "Server Product",
        productType: "physical",
        sku: "SKU-1",
        unitPrice: "10.00",
        quantity: 2,
        lineDiscount: "1.00",
        lineTotal: "19.00",
      }],
      subtotal: "20.00",
      lineDiscountTotal: "1.00",
      orderDiscount: "2.00",
      tax: "0.00",
      total: "17.00",
    }),
    runIdempotent: vi.fn(async (_input, work) => work()),
    transaction: vi.fn(async (work) => work(tx)),
    findOpenShiftId: vi.fn().mockResolvedValue("shift-1"),
    insertOrder: vi.fn(async () => { events.push("order"); }),
    insertOrderItem: vi.fn(async () => { events.push("item"); }),
    allocateInventory: vi.fn(async () => { events.push("inventory"); }),
    recordOrderPayment: vi.fn(async (payment) => {
      events.push(`payment:${payment.method}`);
      return { ...payment, id: `payment-${payment.method}`, createdAt: new Date("2026-07-15T00:00:00Z") };
    }),
    insertTimeline: vi.fn(async () => { events.push("timeline"); }),
    enqueueAuditEvent: vi.fn(async () => { events.push("outbox"); }),
    newId: vi.fn()
      .mockReturnValueOnce("order-1")
      .mockReturnValueOnce("item-1"),
    newOrderNo: vi.fn().mockReturnValue("POS-001"),
    now: vi.fn().mockReturnValue(new Date("2026-07-15T00:00:00Z")),
  };
  return { deps, events, tx };
}

beforeEach(() => vi.clearAllMocks());

describe("POS checkout v1 service", () => {
  it("uses authoritative server pricing and writes the entire split-payment sale in one transaction", async () => {
    const input = checkoutInput();
    const { deps, events, tx } = dependencies();

    const result = await posCheckout(input, deps as never);

    expect(deps.priceOrder).toHaveBeenCalledWith({
      items: input.items,
      order_discount: "2.00",
      tax_rate_bps: 0,
    }, tx);
    expect(deps.insertOrder).toHaveBeenCalledWith(expect.objectContaining({
      id: "order-1",
      total_amount: "17.00",
      staff_id: "staff-1",
      account_user_id: "user-1",
      shift_id: "shift-1",
    }), tx);
    expect(deps.enqueueAuditEvent).toHaveBeenCalledWith(tx, expect.objectContaining({
      eventType: "pos.checkout.completed", entityType: "order", entityId: "order-1", storeId: "store-1",
    }));
    expect(events).toEqual(["order", "item", "payment:cash", "payment:card", "inventory", "timeline", "outbox"]);
    expect(result).toMatchObject({
      id: "order-1",
      source: "pos",
      total: "17.00",
      items: [{ name: "Server Product", unit_price: "10.00" }],
      payments: input.payments,
    });
  });

  it("persists structured pickup facts instead of overloading shipping fields", async () => {
    const input = {
      ...checkoutInput(),
      fulfillment: {
        method: "pickup" as const,
        contact_name: "Pickup Customer",
        phone: "+258840000001",
        pickup_at: "2026-07-22T10:00:00+02:00",
      },
    };
    const { deps, tx } = dependencies();

    const result = await posCheckout(input, deps as never);

    expect(deps.insertOrder).toHaveBeenCalledWith(expect.objectContaining({
      pickup_contact_name: "Pickup Customer",
      pickup_phone: "+258840000001",
      pickup_store_id: "store-1",
      delivery_date: "2026-07-22",
      delivery_time_slot: "10:00",
      fulfillment_status: "unfulfilled",
      shipping_address: null,
    }), tx);
    expect(result).toMatchObject({
      pickup_contact_name: "Pickup Customer",
      pickup_phone: "+258840000001",
      pickup_store_id: "store-1",
    });
  });

  it.each([
    ["LINE_DISCOUNT_EXCEEDS_GROSS"],
    ["ORDER_DISCOUNT_EXCEEDS_TOTAL"],
  ])("propagates shared pricing limit %s before writes", async (code) => {
    const { deps } = dependencies();
    deps.priceOrder.mockRejectedValueOnce(Object.assign(new Error(code), { code }));
    await expect(posCheckout(checkoutInput(), deps as never)).rejects.toMatchObject({ code });
    expect(deps.insertOrder).not.toHaveBeenCalled();
  });

  it("rejects currency and pricing-version mismatches", async () => {
    const currency = dependencies();
    await expect(posCheckout({ ...checkoutInput(), currency: "EUR" }, currency.deps as never)).rejects.toMatchObject({
      code: "CURRENCY_MISMATCH",
      status: 409,
    });

    const pricing = dependencies();
    await expect(posCheckout({ ...checkoutInput(), pricing_version: "stale" }, pricing.deps as never)).rejects.toMatchObject({
      code: "PRICING_VERSION_CHANGED",
      status: 409,
    });
  });

  it("returns the authoritative preview on a pricing mismatch without writes", async () => {
    const input = checkoutInput();
    input.pricing_preview.total = "16.00";
    const { deps } = dependencies();

    await expect(posCheckout(input, deps as never)).rejects.toMatchObject({
      code: "PRICING_CHANGED",
      status: 409,
      details: { subtotal: "20.00", discount: "3.00", tax: "0.00", total: "17.00" },
    });
    expect(deps.insertOrder).not.toHaveBeenCalled();
  });

  it("requires split payments to sum exactly to the authoritative total", async () => {
    const input = checkoutInput();
    input.payments[1].amount = "9.99";
    const { deps } = dependencies();
    await expect(posCheckout(input, deps as never)).rejects.toMatchObject({ code: "PAYMENT_TOTAL_MISMATCH", status: 409 });
    expect(deps.insertOrder).not.toHaveBeenCalled();
  });

  it("rejects forged account, staff, and store identities", async () => {
    for (const patch of [
      { account_user_id: "attacker" },
      { staff_id: "attacker" },
      { store_id: "attacker" },
    ]) {
      const { deps } = dependencies();
      await expect(posCheckout({ ...checkoutInput(), ...patch }, deps as never)).rejects.toMatchObject({
        code: "OPERATOR_MISMATCH",
        status: 403,
      });
      expect(deps.transaction).not.toHaveBeenCalled();
    }
  });

  it("requires the authenticated operator to have checkout permission", async () => {
    const input = checkoutInput();
    input.operator.permissions = ["refund"];
    const { deps } = dependencies();

    await expect(posCheckout(input, deps as never)).rejects.toMatchObject({
      code: "CHECKOUT_PERMISSION_REQUIRED",
      status: 403,
    });
    expect(deps.getStore).not.toHaveBeenCalled();
    expect(deps.transaction).not.toHaveBeenCalled();
  });

  it("propagates transaction failure and does not write later records", async () => {
    const { deps } = dependencies();
    deps.allocateInventory.mockRejectedValueOnce(Object.assign(new Error("stock"), { code: "INSUFFICIENT_INVENTORY" }));
    await expect(posCheckout(checkoutInput(), deps as never)).rejects.toMatchObject({ code: "INSUFFICIENT_INVENTORY" });
    expect(deps.insertTimeline).not.toHaveBeenCalled();
  });

  it("returns an idempotent replay without opening another transaction", async () => {
    const { deps } = dependencies();
    const replay = { id: "existing-order", total: "17.00" };
    deps.runIdempotent.mockResolvedValueOnce(replay);
    await expect(posCheckout(checkoutInput(), deps as never)).resolves.toBe(replay);
    expect(deps.runIdempotent).toHaveBeenCalledWith(expect.objectContaining({
      key: "android-checkout-001",
      operation: "checkout",
      storeId: "store-1",
      requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }), expect.any(Function), {
      responseStatus: 201,
      resourceType: "order",
      resourceId: expect.any(Function),
    });
    expect(deps.transaction).not.toHaveBeenCalled();
  });
});
