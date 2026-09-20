import { describe, expect, it } from "vitest";

import {
  formatSalesMoney,
  getCatalogProductTypeLabel,
  translate,
} from "@/i18n";

describe("storefront catalog and cart presentation", () => {
  it("maps stable product types without translating merchant data", () => {
    expect(getCatalogProductTypeLabel("en", "service")).toBe("Consulting service");
    expect(getCatalogProductTypeLabel("pt", "virtual")).toBe("Produto digital");
    expect(getCatalogProductTypeLabel("en", "future_type")).toBe("Product");
  });

  it("provides typed cart and bounded checkout copy", () => {
    expect(translate("pt", "cart.empty")).toBe("Seu carrinho est\u00e1 vazio");
    expect(translate("en", "checkout.delivery_zone")).toBe("Delivery zone");
    expect(
      translate("en", "checkout.free_shipping_threshold", {
        amount: "$50.00",
      }),
    ).toBe("Free shipping from $50.00");
  });

  it("formats sales money from an ISO currency instead of a literal symbol", () => {
    expect(formatSalesMoney("en", 12.5, "usd")).toBe("$12.50");
    expect(formatSalesMoney("pt", 1250, "MZN")).toContain("1.250,00");
  });
});
