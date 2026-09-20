import { describe, expect, it } from "vitest";

import {
  hashPosRequest,
  parsePosCheckoutRequest,
  parsePosExchangeRequest,
  parsePosInventoryAdjustmentRequest,
  parsePosPurchaseOrderCreateRequest,
  parsePosPurchaseOrderReceiveRequest,
  parsePosRefundRequest,
  parsePosTransferCreateRequest,
} from "../pos-contracts";
import { PosApiError } from "../pos-errors";

function validRequest() {
  return {
    idempotency_key: "android-checkout-001",
    store_id: "store-1",
    currency: "USD",
    staff_id: "staff-1",
    customer_id: null,
    note: null,
    fulfillment: { method: "in_store" },
    items: [
      { product_id: "product-1", variant_id: null, quantity: 2, line_discount: "1.00" },
    ],
    order_discount: "2.00",
    pricing_preview: { subtotal: "20.00", discount: "3.00", tax: "0.00", total: "17.00" },
    pricing_version: "2026-07-15T00:00:00Z",
    payments: [
      { method: "cash", label: "Cash", amount: "7.00", reference: null },
      { method: "card", label: "Card", amount: "10.00", reference: "TERM-1" },
    ],
  };
}

describe("POS checkout v1 contract", () => {
  it("parses a valid split-payment checkout", () => {
    expect(parsePosCheckoutRequest(validRequest())).toEqual(validRequest());
  });

  it("requires an idempotency key", () => {
    const { idempotency_key: _, ...request } = validRequest();
    void _;
    expect(() => parsePosCheckoutRequest(request)).toThrowError(/idempotency_key/i);
  });

  it.each(["1", "1.0", "1.000", "-1.00", "NaN"])("rejects malformed decimal %s", (amount) => {
    const request = validRequest();
    request.payments[0].amount = amount;
    expect(() => parsePosCheckoutRequest(request)).toThrowError(/amount/i);
  });

  it("rejects amounts that exceed the orders DECIMAL(10,2) limit", () => {
    const request = validRequest();
    request.pricing_preview.total = "100000000.00";
    expect(() => parsePosCheckoutRequest(request)).toThrowError(/pricing_preview/i);
  });

  it("accepts a 64-character payment code and rejects longer codes", () => {
    const request = validRequest();
    request.payments[0].method = "m".repeat(64);
    expect(parsePosCheckoutRequest(request).payments[0].method).toHaveLength(64);
    request.payments[0].method = "m".repeat(65);
    expect(() => parsePosCheckoutRequest(request)).toThrowError(/method/i);
  });

  it("rejects payment references longer than the database field", () => {
    const request = validRequest();
    request.payments[0].reference = "r".repeat(201);
    expect(() => parsePosCheckoutRequest(request)).toThrowError(/reference/i);
  });

  it("rejects zero quantity", () => {
    const request = validRequest();
    request.items[0].quantity = 0;
    expect(() => parsePosCheckoutRequest(request)).toThrowError(/quantity/i);
  });

  it("rejects unsupported fulfillment", () => {
    const request = validRequest() as ReturnType<typeof validRequest> & { fulfillment: { method: string } };
    request.fulfillment.method = "drone";
    expect(() => parsePosCheckoutRequest(request)).toThrowError(/fulfillment/i);
  });

  it("hashes object keys deterministically while preserving array order", () => {
    expect(hashPosRequest({ b: 2, nested: { d: 4, c: 3 }, a: 1 })).toBe(
      hashPosRequest({ a: 1, nested: { c: 3, d: 4 }, b: 2 }),
    );
    expect(hashPosRequest({ items: ["a", "b"] })).not.toBe(hashPosRequest({ items: ["b", "a"] }));
  });

  it("serializes typed errors into the stable Android envelope", () => {
    const error = new PosApiError("PRICING_CHANGED", "Pricing changed", 409, false, { total: "18.00" });
    expect(error.toJSON()).toEqual({
      error: {
        code: "PRICING_CHANGED",
        message: "Pricing changed",
        retryable: false,
        details: { total: "18.00" },
      },
    });
  });
});

describe("POS exchange contract", () => {
  function validExchange() {
    return {
      idempotency_key: "exchange-001",
      store_id: "store-1",
      original_order_id: "order-1",
      return_items: [{ order_item_id: "item-1", quantity: 1, restock: true }],
      replacement: validRequest(),
      difference_payment: [{ method: "cash", label: "Cash", amount: "3.00", reference: null }],
      approval_token: null,
    };
  }

  it("parses the strict Task 8 request", () => {
    expect(parsePosExchangeRequest(validExchange())).toEqual(validExchange());
  });

  it.each([
    { return_items: [] },
    { return_items: [{ order_item_id: "item-1", quantity: 0, restock: true }] },
    { unexpected: true },
  ])("rejects malformed or extra exchange fields %#", (patch) => {
    expect(() => parsePosExchangeRequest({ ...validExchange(), ...patch })).toThrowError(/exchange|return_items|quantity|unrecognized/i);
  });
});

describe("POS refund contract", () => {
  function validRefund() {
    return {
      idempotency_key: "refund-001",
      store_id: "store-1",
      return_items: [{ order_item_id: "item-1", quantity: 1, restock: true }],
      reason: "Customer return",
      approval_token: "approval-token",
    };
  }

  it("parses immutable return lines", () => {
    expect(parsePosRefundRequest(validRefund())).toEqual(validRefund());
  });

  it("rejects duplicate order item lines", () => {
    const item = validRefund().return_items[0];
    expect(() => parsePosRefundRequest({ ...validRefund(), return_items: [item, item] }))
      .toThrowError(/return_items/i);
  });
});

describe("POS inventory and purchasing contracts", () => {
  it("parses a strict inventory adjustment", () => {
    const request = {
      idempotency_key: "adjust-1", store_id: "store-1", product_id: "product-1",
      variant_id: null, location_id: "warehouse-1", delta: -2, reason: "damage",
      note: "Broken seal", approval_token: "approval-token",
    };
    expect(parsePosInventoryAdjustmentRequest(request)).toEqual(request);
  });

  it.each([
    { delta: 0 },
    { delta: 1.5 },
    { reason: "sale" },
    { unexpected: true },
  ])("rejects malformed inventory adjustment %#", (patch) => {
    const request = {
      idempotency_key: "adjust-1", store_id: "store-1", product_id: "product-1",
      variant_id: null, location_id: null, delta: 1, reason: "count",
      note: null, approval_token: null,
    };
    expect(() => parsePosInventoryAdjustmentRequest({ ...request, ...patch }))
      .toThrowError(/adjustment|delta|reason|unrecognized/i);
  });

  it("parses purchase create and whole-order receive requests", () => {
    const create = {
      idempotency_key: "po-create-1", store_id: "store-1", location_id: "warehouse-1",
      supplier: "Supplier A", items: [
        { product_id: "product-1", variant_id: null, ordered_qty: 2, unit_cost: "3.25" },
      ],
    };
    expect(parsePosPurchaseOrderCreateRequest(create)).toEqual(create);
    expect(parsePosPurchaseOrderReceiveRequest({
      idempotency_key: "po-receive-1", store_id: "store-1", approval_token: "approval-token",
    })).toEqual({ idempotency_key: "po-receive-1", store_id: "store-1", approval_token: "approval-token" });
  });

  it("rejects duplicate purchase lines and partial receive fields", () => {
    const item = { product_id: "product-1", variant_id: null, ordered_qty: 2, unit_cost: "3.25" };
    expect(() => parsePosPurchaseOrderCreateRequest({
      idempotency_key: "po-create-1", store_id: "store-1", location_id: null,
      supplier: "Supplier A", items: [item, item],
    })).toThrowError(/items/i);
    expect(() => parsePosPurchaseOrderReceiveRequest({
      idempotency_key: "po-receive-1", store_id: "store-1", items: [{ quantity: 1 }],
    })).toThrowError(/receive|unrecognized/i);
  });

  it("parses a transfer request with immutable warehouse locations", () => {
    const request = {
      idempotency_key: "transfer-1", store_id: "store-1",
      from_location_id: "warehouse-1", to_location_id: "warehouse-2",
      note: null, items: [{ product_id: "product-1", variant_id: null, quantity: 2 }],
    };
    expect(parsePosTransferCreateRequest(request)).toEqual(request);
  });
});
