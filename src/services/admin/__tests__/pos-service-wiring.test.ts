import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/services/admin/pos-service.ts"), "utf8");

describe("legacy POS checkout domain wiring", () => {
  it("delegates pricing, fulfillment, and inventory to shared services", () => {
    expect(source).toContain("priceOrder(");
    expect(source).toContain("validateFulfillment(");
    expect(source).toContain("allocateInventory(");
  });

  it("does not retain the duplicated inventory allocation helpers", () => {
    expect(source).not.toContain("function usableRows(");
    expect(source).not.toContain("function deductFromRows(");
  });
});
