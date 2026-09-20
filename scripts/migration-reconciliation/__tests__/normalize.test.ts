import { describe, expect, it } from "vitest";

import {
  normalizeCheck,
  normalizeColumn,
  normalizeDefault,
  normalizeExpression,
  normalizeIndex,
  normalizeReferentialAction,
} from "../normalize";
import type { ColumnEvidence, IndexEvidence } from "../types";

function column(overrides: Partial<ColumnEvidence> = {}): ColumnEvidence {
  return {
    table: "inventory",
    name: "variant_scope_key",
    ordinal_position: 1,
    column_type: "VARCHAR(36)",
    nullable: false,
    default: null,
    extra: "STORED GENERATED",
    generation_expression: "((coalesce(`variant_id`,_utf8mb4'')))",
    character_set: "utf8mb4",
    collation: "utf8mb4_0900_ai_ci",
    ...overrides,
  };
}

describe("normalizeDefault", () => {
  it.each([
    [null, null],
    ["NULL", null],
    ["0.00", "0.00"],
    ["CURRENT_TIMESTAMP()", "current_timestamp"],
    ["current_timestamp", "current_timestamp"],
    ["UUID()", "uuid()"],
    ["'recorded'", "recorded"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeDefault(input)).toBe(expected);
  });
});

describe("normalizeExpression", () => {
  it("normalizes generated expressions without changing operand order", () => {
    expect(normalizeExpression("((coalesce(`variant_id`,_utf8mb4'')))"))
      .toBe("coalesce(variant_id,'')");
  });

  it("preserves string literal case", () => {
    expect(normalizeExpression("IF(`status` = 'Ordered', 1, 0)"))
      .toBe("if(status='Ordered',1,0)");
  });

  it("normalizes escaped charset introducers returned by INFORMATION_SCHEMA", () => {
    expect(normalizeExpression("coalesce(`variant_id`,_utf8mb4\\'\\')"))
      .toBe("coalesce(variant_id,'')");
  });
});

describe("normalizeCheck", () => {
  it("removes MySQL quoting and redundant parentheses but preserves enum order", () => {
    expect(normalizeCheck(
      "((`status` in (_utf8mb4'ordered',_utf8mb4'received',_utf8mb4'cancelled')))",
    )).toBe("status in ('ordered','received','cancelled')");
  });

  it("normalizes escaped CHECK literals returned by INFORMATION_SCHEMA", () => {
    expect(normalizeCheck(
      "status in (_utf8mb4\\'ordered\\',_utf8mb4\\'received\\',_utf8mb4\\'cancelled\\')",
    )).toBe("status in ('ordered','received','cancelled')");
  });
});

describe("normalizeColumn", () => {
  it.each([
    ["VARCHAR(64)", "varchar(64)"],
    ["DECIMAL(12,2)", "decimal(12,2)"],
    ["TIMESTAMP(3)", "timestamp(3)"],
    ["TINYINT(1)", "tinyint(1)"],
    ["JSON", "json"],
  ])("normalizes column type %s", (input, expected) => {
    expect(normalizeColumn(column({ column_type: input })).columnType).toBe(expected);
  });

  it("normalizes default, extra, and generated expression together", () => {
    expect(normalizeColumn(column())).toMatchObject({
      name: "variant_scope_key",
      columnType: "varchar(36)",
      nullable: false,
      default: null,
      extra: "stored generated",
      generationExpression: "coalesce(variant_id,'')",
    });
  });
});

describe("normalizeIndex", () => {
  it("preserves ordered composite index columns", () => {
    const evidence: IndexEvidence = {
      table: "orders",
      name: "orders_store_created_idx",
      unique: false,
      index_type: "BTREE",
      columns: [
        { name: "store_id", order: "ASC", prefix_length: null },
        { name: "created_at", order: "ASC", prefix_length: null },
        { name: "id", order: "ASC", prefix_length: null },
      ],
    };

    expect(normalizeIndex(evidence).columns.map((item) => item.name))
      .toEqual(["store_id", "created_at", "id"]);
  });

  it("rejects a non-BTREE index instead of normalizing away the difference", () => {
    const evidence: IndexEvidence = {
      table: "orders",
      name: "orders_store_created_idx",
      unique: false,
      index_type: "HASH",
      columns: [{ name: "store_id", order: "ASC", prefix_length: null }],
    };

    expect(() => normalizeIndex(evidence)).toThrow(/HASH/);
  });
});

describe("normalizeReferentialAction", () => {
  it.each([
    ["no action", "RESTRICT"],
    ["restrict", "RESTRICT"],
    ["CASCADE", "CASCADE"],
    ["set null", "SET NULL"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeReferentialAction(input)).toBe(expected);
  });

  it("rejects an unknown action", () => {
    expect(() => normalizeReferentialAction("SET DEFAULT")).toThrow(/SET DEFAULT/);
  });
});
