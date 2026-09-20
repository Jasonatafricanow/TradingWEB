import { describe, expect, it } from "vitest";

import { formatCents, parseMoneyToCents } from "../order-money";
import {
  priceOrder,
  type PricingRepository,
} from "../order-pricing-service";

function repository(overrides: Partial<PricingRepository> = {}): PricingRepository {
  return {
    getProduct: async (id) => ({
      id,
      title: "T-shirt",
      type: "physical",
      price: "10.00",
      status: "active",
    }),
    getVariant: async (_productId, id) => ({
      id,
      title: "Large",
      sku: "TS-L",
      price: "12.50",
    }),
    hasVariants: async () => false,
    ...overrides,
  };
}

describe("order money", () => {
  it("converts exact decimal strings to integer cents", () => {
    expect(parseMoneyToCents("10.09")).toBe(1009);
    expect(parseMoneyToCents("0.5")).toBe(50);
    expect(formatCents(1009)).toBe("10.09");
  });

  it("rejects non-canonical or unsafe monetary values", () => {
    expect(() => parseMoneyToCents("1.001")).toThrow("INVALID_MONEY");
    expect(() => parseMoneyToCents("NaN")).toThrow("INVALID_MONEY");
    expect(() => formatCents(1.5)).toThrow("INVALID_CENTS");
  });
});

describe("priceOrder", () => {
  it("uses the variant price and calculates discounts in cents", async () => {
    const result = await priceOrder({
      items: [{ product_id: "p1", variant_id: "v1", quantity: 2, line_discount: "1.00" }],
      order_discount: "2.00",
    }, repository({ hasVariants: async () => true }));

    expect(result.lines[0]).toMatchObject({
      productId: "p1",
      variantId: "v1",
      unitPrice: "12.50",
      quantity: 2,
      lineDiscount: "1.00",
      lineTotal: "24.00",
    });
    expect(result).toMatchObject({
      subtotal: "25.00",
      lineDiscountTotal: "1.00",
      orderDiscount: "2.00",
      tax: "0.00",
      total: "22.00",
    });
  });

  it("requires a variant when an active product has variants", async () => {
    await expect(priceOrder({
      items: [{ product_id: "p1", variant_id: null, quantity: 1, line_discount: "0.00" }],
      order_discount: "0.00",
    }, repository({ hasVariants: async () => true }))).rejects.toThrow("VARIANT_REQUIRED");
  });

  it("calculates percentage tax after line and order discounts", async () => {
    const result = await priceOrder({
      items: [{ product_id: "p1", variant_id: null, quantity: 1, line_discount: "1.00" }],
      order_discount: "1.00",
      tax_rate_bps: 1500,
    }, repository());

    expect(result).toMatchObject({
      subtotal: "10.00",
      lineDiscountTotal: "1.00",
      orderDiscount: "1.00",
      tax: "1.20",
      total: "9.20",
    });
  });

  it("rejects discounts that exceed their price scope", async () => {
    await expect(priceOrder({
      items: [{ product_id: "p1", variant_id: null, quantity: 1, line_discount: "10.01" }],
      order_discount: "0.00",
    }, repository())).rejects.toThrow("LINE_DISCOUNT_EXCEEDS_GROSS");

    await expect(priceOrder({
      items: [{ product_id: "p1", variant_id: null, quantity: 1, line_discount: "0.00" }],
      order_discount: "10.01",
    }, repository())).rejects.toThrow("ORDER_DISCOUNT_EXCEEDS_TOTAL");
  });
});
