import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  existingBarcodes: new Set<string>(),
  inserted: [] as Array<{ table: string; values: Record<string, unknown> }>,
  failVariantInsert: false,
}));

vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("drizzle-orm")>()),
  eq: (_column: unknown, value: unknown) => ({ barcode: value }),
}));
vi.mock("@/services/auth/auth-middleware", () => ({
  requireStaffRole: vi.fn().mockResolvedValue(undefined),
  errorResponse: (error: unknown) => Response.json({ error: String(error) }, { status: 500 }),
}));
vi.mock("@/services/admin/product-type-service", () => ({
  listProductTypes: vi.fn().mockResolvedValue({ data: [{ code: "physical" }, { code: "service" }], error: null }),
}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/storage/database/shared/schema");
  const tableName = (table: unknown) => table === schema.products ? "products" : table === schema.productVariants ? "variants" : "other";
  return {
    db: {
      select: () => ({
        from: (table: unknown) => table === schema.categories
          ? Promise.resolve([{ id: "cat-1", name: "Tools", name_en: null }])
          : { where: (condition: { barcode: string }) => ({
            limit: async () => mocks.existingBarcodes.has(condition.barcode) ? [{ id: "existing" }] : [],
          }) },
      }),
      transaction: async (work: (tx: unknown) => Promise<void>) => {
        const staged: typeof mocks.inserted = [];
        const tx = { insert: (table: unknown) => ({ values: async (values: Record<string, unknown>) => {
          if (tableName(table) === "variants" && mocks.failVariantInsert) throw new Error("variant write failed");
          staged.push({ table: tableName(table), values });
        } }) };
        await work(tx);
        mocks.inserted.push(...staged); // commit only when the whole row succeeded
      },
    },
  };
});

import { POST } from "@/app/api/admin/products/import/route";

const post = async (rows: Array<Record<string, string>>) => {
  const response = await POST(new Request("http://localhost/api/admin/products/import", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ products: rows }),
  }) as never);
  return response.json();
};
const row = (overrides: Record<string, string> = {}) => ({ title: "Drill", price: "10.50", category: "Tools", type: "physical", status: "active", ...overrides });

describe("product CSV import", () => {
  beforeEach(() => { mocks.existingBarcodes.clear(); mocks.inserted.length = 0; mocks.failVariantInsert = false; });

  it("rejects unknown types, invalid statuses and locale-formatted prices without writing", async () => {
    const result = await post([row({ type: "weapon" }), row({ status: "published" }), row({ price: "1.234,56" })]);
    expect(result).toMatchObject({ imported: 0, failed: 3 });
    expect(result.errors.map((error: { row: number }) => error.row)).toEqual([1, 2, 3]);
    expect(mocks.inserted).toEqual([]);
  });

  it("skips barcodes that already exist or repeat within the same file", async () => {
    mocks.existingBarcodes.add("EAN-1");
    const result = await post([row({ barcode: "EAN-1" }), row({ barcode: "EAN-2" }), row({ barcode: "EAN-2" })]);
    expect(result).toMatchObject({ imported: 1, failed: 2 });
    expect(mocks.inserted.filter(entry => entry.table === "products")).toHaveLength(1);
  });

  it("imports exported rows with variant stock as a warning instead of failing", async () => {
    const result = await post([row({ variants: "Red:10.50:7" })]);
    expect(result).toMatchObject({ imported: 1, failed: 0 });
    expect(result.warnings).toEqual([{ row: 1, warning: expect.stringContaining("stock ignored") }]);
    expect(mocks.inserted.map(entry => entry.table)).toEqual(["products", "variants"]);
    expect(mocks.inserted[1].values).not.toHaveProperty("stock");
  });

  it("does not keep a product whose variant write fails", async () => {
    mocks.failVariantInsert = true;
    const result = await post([row({ variants: "Red:10.50:0" })]);
    expect(result).toMatchObject({ imported: 0, failed: 1 });
    expect(mocks.inserted).toEqual([]);
  });
});
