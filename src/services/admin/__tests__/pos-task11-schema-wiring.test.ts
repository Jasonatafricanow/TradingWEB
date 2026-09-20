import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Task 11 schema and service wiring", () => {
  it("blocks both current inventory mismatches before rerunnable Task 11 schema DDL", () => {
    const sql = readFileSync(resolve(process.cwd(), "drizzle/0031_pos_purchase_orders.sql"), "utf8");
    const firstPreflightCall = sql.indexOf("CALL pos_task11_preflight()");
    const finalPreflightCall = sql.lastIndexOf("CALL pos_task11_preflight()");
    const finalPreflightCreate = sql.lastIndexOf("CREATE PROCEDURE pos_task11_preflight()");
    const finalPreflightDrop = sql.lastIndexOf("DROP PROCEDURE IF EXISTS pos_task11_preflight", finalPreflightCreate);
    const safeBackfill = sql.indexOf("INSERT INTO inventory");
    const stockMismatchSync = sql.indexOf("CREATE TEMPORARY TABLE pos_current_stock_total_mismatches");
    const guardedSchemaStart = sql.indexOf("DROP PROCEDURE IF EXISTS pos_task11_apply_schema");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS pos_inventory_migration_exceptions");
    expect(sql).toContain("DROP PROCEDURE IF EXISTS pos_task11_preflight");
    expect(sql).toContain("CREATE PROCEDURE pos_task11_preflight()");
    expect(sql).toContain("SIGNAL SQLSTATE '45000'");
    expect(sql).toContain("unresolved PRODUCT_VARIANT_MISMATCH");
    expect(sql).toContain("unresolved STOCK_TOTAL_MISMATCH");
    expect(firstPreflightCall).toBeLessThan(safeBackfill);
    expect(safeBackfill).toBeLessThan(stockMismatchSync);
    expect(stockMismatchSync).toBeLessThan(finalPreflightCall);
    expect(finalPreflightDrop).toBeLessThan(finalPreflightCreate);
    expect(finalPreflightCreate).toBeLessThan(finalPreflightCall);
    expect(finalPreflightCall).toBeGreaterThan(0);
    expect(guardedSchemaStart).toBeGreaterThan(finalPreflightCall);
    expect(sql.indexOf("CREATE TABLE IF NOT EXISTS pos_purchase_orders")).toBeGreaterThan(finalPreflightCall);
  });

  it("synchronizes current exceptions and makes every safety step rerunnable", () => {
    const sql = readFileSync(resolve(process.cwd(), "drizzle/0031_pos_purchase_orders.sql"), "utf8");

    expect(sql).toContain("DROP TEMPORARY TABLE IF EXISTS pos_current_product_variant_mismatches");
    expect(sql).toContain("DROP TEMPORARY TABLE IF EXISTS pos_current_stock_total_mismatches");
    expect(sql).toContain("e.resolved_at = CASE");
    expect(sql).toContain("CURRENT_TIMESTAMP");
    expect(sql).toContain("DROP TEMPORARY TABLE IF EXISTS pos_inventory_scope_rollup");
    expect(sql).toContain("DROP PROCEDURE IF EXISTS pos_task11_apply_schema");
    expect(sql).toContain("information_schema.COLUMNS");
    expect(sql).toContain("information_schema.STATISTICS");
    expect(sql).toContain("information_schema.TABLE_CONSTRAINTS");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS pos_purchase_order_items");
  });

  it("checks all Task 11 database CHECK constraints in the source integrity gate", () => {
    const integrity = readFileSync(resolve(process.cwd(), "scripts/schema-integrity-check.ts"), "utf8");

    expect(integrity).toContain("information_schema.CHECK_CONSTRAINTS");
    expect(integrity).toContain("information_schema.TABLE_CONSTRAINTS");
    expect(integrity).toContain("pos_purchase_orders_status_check");
    expect(integrity).toContain("pos_purchase_order_items_ordered_qty_check");
    expect(integrity).toContain("pos_purchase_order_items_received_qty_check");
    expect(integrity).toContain("pos_purchase_order_items_unit_cost_check");
  });

  it("defines idempotent purchase facts and store/location foreign keys in migration 0031", () => {
    const sql = readFileSync(resolve(process.cwd(), "drizzle/0031_pos_purchase_orders.sql"), "utf8");
    const journal = readFileSync(resolve(process.cwd(), "drizzle/meta/_journal.json"), "utf8");
    const integrity = readFileSync(resolve(process.cwd(), "scripts/schema-integrity-check.ts"), "utf8");
    const schema = readFileSync(resolve(process.cwd(), "src/storage/database/shared/schema.ts"), "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS pos_purchase_orders");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS pos_purchase_order_items");
    expect(sql).toContain("pos_purchase_orders_idempotency_unique");
    expect(sql).toContain("FOREIGN KEY (store_id) REFERENCES stores(id)");
    expect(sql).toContain("FOREIGN KEY (location_id) REFERENCES warehouses(id)");
    expect(sql).toContain("FOREIGN KEY (purchase_order_id)");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS pos_inventory_migration_exceptions");
    expect(sql).toContain("inventory_scope_unique");
    expect(sql).toContain("variant_scope_key");
    expect(sql).toContain("store_scope_key");
    expect(sql).toContain("warehouse_scope_key");
    expect(sql).toContain("DUPLICATE_SCOPE");
    expect(sql).toContain("AMBIGUOUS_DEFAULT_LOCATION");
    expect(sql).toContain("PRODUCT_VARIANT_MISMATCH");
    expect(sql).toContain("STOCK_TOTAL_MISMATCH");
    expect(sql).toContain("pos_task11_preflight");
    expect(sql).toContain("CHECK (ordered_qty > 0)");
    expect(sql).toContain("CHECK (received_qty BETWEEN 0 AND ordered_qty)");
    expect(integrity).toContain("pos_inventory_migration_exceptions");
    expect(integrity).toContain("inventory_scope_unique");
    expect(integrity).toContain("variant_scope_key");
    expect(integrity).toContain("stock_transfers: ['store_id']");
    expect(integrity).toContain("PRODUCT_VARIANT_MISMATCH");
    expect(integrity).toContain("STOCK_TOTAL_MISMATCH");
    expect(schema).toContain("export const posInventoryMigrationExceptions");
    expect(schema).toContain('uniqueIndex("inventory_scope_unique")');
    expect(schema).toContain('generatedAlwaysAs(sql`COALESCE(variant_id, \'\')`');
    expect(schema).toContain('check("pos_purchase_orders_status_check"');
    expect(schema).toContain('check("pos_purchase_order_items_ordered_qty_check"');
    expect(journal).toContain('"tag":  "0031_pos_purchase_orders"');
  });

  it("makes inventory the only POS catalog and checkout stock truth", () => {
    const catalog = readFileSync(resolve(process.cwd(), "src/services/admin/pos-service.ts"), "utf8");
    const allocation = readFileSync(resolve(process.cwd(), "src/services/inventory/inventory-allocation-service.ts"), "utf8");
    expect(catalog).not.toContain("ELSE v.stock");
    expect(catalog).not.toContain("product_variants.stock");
    expect(allocation).not.toContain("lockVariantStock");
    expect(allocation).not.toContain("setVariantStock");
    expect(allocation).not.toContain("decrementVariantStock");
    expect(catalog).toContain("i.product_id = p.id");
  });

  it("wires Web sale/cancel and POS sale/refund to the shared inventory ledger", () => {
    const webStock = readFileSync(resolve(process.cwd(), "src/services/orders/order-stock-service.ts"), "utf8");
    const webOrder = readFileSync(resolve(process.cwd(), "src/services/orders/order-service.ts"), "utf8");
    const posRefund = readFileSync(resolve(process.cwd(), "src/services/admin/refund-service.ts"), "utf8");
    const legacyPos = readFileSync(resolve(process.cwd(), "src/app/api/pos/orders/route.ts"), "utf8");
    const productView = readFileSync(resolve(process.cwd(), "src/services/admin/products-service.ts"), "utf8");

    expect(webStock).toContain("allocateInventory(");
    expect(webStock).toContain("restoreInventory(");
    expect(webStock).not.toContain("productVariants.stock");
    expect(webOrder).not.toContain("variant.stock");
    expect(posRefund).toContain("restoreInventory(");
    expect(posRefund).not.toContain("productVariants.stock");
    expect(legacyPos).toContain("allocateInventory(");
    expect(legacyPos).not.toContain("productVariants.stock");
    expect(productView).not.toContain("SUM(pv.stock)");
  });

  it("prevents admin/import/export runtime paths from reviving legacy variant stock", () => {
    const variants = readFileSync(resolve(process.cwd(), "src/services/products/variant-service.ts"), "utf8");
    const receiver = readFileSync(resolve(process.cwd(), "src/services/import/product-receiver.ts"), "utf8");
    const csvImport = readFileSync(resolve(process.cwd(), "src/app/api/admin/products/import/route.ts"), "utf8");
    const csvExport = readFileSync(resolve(process.cwd(), "src/app/api/admin/products/export/route.ts"), "utf8");
    const reconciliation = readFileSync(resolve(process.cwd(), "scripts/reconciliation-check.ts"), "utf8");

    expect(variants).not.toContain("values.stock");
    expect(receiver).not.toContain("stock: v.inventory_quantity");
    expect(csvImport).not.toContain("stock: stockOrZero(variant.stock)");
    expect(csvExport).not.toContain("stock: v.stock");
    expect(reconciliation).not.toContain("v.stock < 0");
    expect(reconciliation).toContain("tl.action IN ('pos_sale', 'pos_exchange_replacement')");
  });

  it("keeps POS transfer creation delegated to the existing transfer service", () => {
    const source = readFileSync(resolve(process.cwd(), "src/services/admin/inventory-service.ts"), "utf8");
    expect(source).toContain("from './transfer-service'");
    expect(source).toContain("dependencies.createTransfer({");
    expect(source).not.toContain("INSERT INTO stock_transfers");
    expect(source).not.toContain("INSERT INTO transfer_items");
  });

  it("selects the exact product variant throughout the reused transfer lifecycle", () => {
    const source = readFileSync(resolve(process.cwd(), "src/services/admin/transfer-service.ts"), "utf8");
    expect(source).toContain("target.variantId === null ? isNull(inventory.variant_id) : eq(inventory.variant_id, target.variantId)");
    expect(source).toContain("eq(productVariants.product_id, productId)");
    expect(source).toContain("dependencies.validateProductVariant(item.productId, item.variantId, tx)");
    expect(source).toContain("dependencies.lockTransfer(id, tx)");
    expect(source).not.toContain("START TRANSACTION");
    expect(source).not.toContain("ROLLBACK");
  });

  it("requires whole-order receiving and writes inventory journal plus audit outbox", () => {
    const source = readFileSync(resolve(process.cwd(), "src/services/admin/pos-purchase-service.ts"), "utf8");
    expect(source).toContain("PARTIAL_RECEIPT_UNSUPPORTED");
    expect(source).toContain('referenceType: "purchase_order"');
    expect(source).toContain('eventType: "pos.purchase_order.received"');
  });
});
