import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Task 12 schema and route wiring", () => {
  it("adds rerunnable structured pickup fields and pagination indexes", () => {
    const migration = readFileSync(resolve(process.cwd(), "drizzle/0032_pos_fulfillment.sql"), "utf8");
    for (const field of ["pickup_contact_name", "pickup_phone", "pickup_store_id", "pickup_ready_at", "picked_up_at"]) {
      expect(migration).toContain(`COLUMN_NAME = '${field}'`);
      expect(migration).toContain(`ADD COLUMN ${field}`);
    }
    expect(migration).toContain("CREATE PROCEDURE pos_task12_apply_schema");
    expect(migration).toContain("orders_store_created_idx");
    expect(migration).toContain("orders_customer_created_idx");
    expect(migration).toContain("orders_pickup_status_idx");
  });

  it("keeps Drizzle schema and migration journal aligned", () => {
    const schema = readFileSync(resolve(process.cwd(), "src/storage/database/shared/schema.ts"), "utf8");
    const journal = readFileSync(resolve(process.cwd(), "drizzle/meta/_journal.json"), "utf8");
    expect(schema).toContain('pickup_contact_name: varchar("pickup_contact_name"');
    expect(schema).toContain('index("orders_store_created_idx")');
    expect(schema).toContain('index("orders_customer_created_idx")');
    expect(schema).toContain('index("orders_pickup_status_idx")');
    expect(journal).toContain('"tag":  "0032_pos_fulfillment"');
  });
});
