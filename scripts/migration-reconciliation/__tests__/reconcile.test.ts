import { describe, expect, it } from "vitest";

import registeredScenario from "../fixtures/registered-exact.json";
import missingScenario from "../fixtures/missing-0026-0032.json";
import { reconcile } from "../reconcile";
import { renderProposedSql } from "../render/proposed-sql";
import type { AggregateName, MigrationId } from "../types";
import {
  buildReconcileFixture,
  refreshFixtureFingerprint,
  removeJournalRowsFrom,
} from "./reconcile-fixture";

function migrationStatus(
  report: ReturnType<typeof reconcile>,
  id: MigrationId,
) {
  return report.migrations.find((migration) => migration.id === id)?.status;
}

describe("reconcile journal decisions", () => {
  it("returns exit 0 when all target rows and postconditions are exact", async () => {
    const fixture = await buildReconcileFixture();

    const report = reconcile(fixture);

    expect(report.decision).toEqual({ kind: registeredScenario.expected_decision, exitCode: 0 });
    expect(report.migrations.every((item) => item.status === "REGISTERED_EXACT")).toBe(true);
  });

  it("returns exit 10 for missing 0026-0033 after the exact 0025 anchor", async () => {
    const fixture = await buildReconcileFixture();
    removeJournalRowsFrom(fixture, "0026");

    const report = reconcile(fixture);

    expect(report.decision).toEqual({
      kind: missingScenario.expected_decision,
      exitCode: 10,
      missingSuffix: ["0026", "0027", "0028", "0029", "0030", "0031", "0032", "0033"],
    });
  });

  it("returns exit 10 for a later missing suffix after an exact target prefix", async () => {
    const fixture = await buildReconcileFixture();
    removeJournalRowsFrom(fixture, "0030");

    expect(reconcile(fixture).decision).toEqual({
      kind: "JOURNAL_REPAIR_ELIGIBLE",
      exitCode: 10,
      missingSuffix: ["0030", "0031", "0032", "0033"],
    });
  });

  it("blocks a missing middle row followed by a registered later row", async () => {
    const fixture = await buildReconcileFixture();
    const missing = fixture.manifest.find((entry) => entry.id === "0028")!;
    fixture.snapshot.journal_rows = fixture.snapshot.journal_rows
      .filter((row) => row.created_at !== String(missing.when));

    const report = reconcile(fixture);

    expect(report.decision).toEqual({ kind: "BLOCKED", exitCode: 20 });
    expect(report.findings.map((finding) => finding.code)).toContain("JOURNAL_GAP");
  });

  it.each(["wrong", "duplicate"] as const)(
    "blocks a %s 0025 predecessor anchor",
    async (variant) => {
      const fixture = await buildReconcileFixture();
      const anchor = fixture.manifest[0]!;
      if (variant === "wrong") {
        fixture.snapshot.journal_rows[0]!.hash = "0".repeat(64);
      } else {
        fixture.snapshot.journal_rows.push({
          id: "999",
          hash: anchor.sha256,
          created_at: String(anchor.when),
        });
      }

      const report = reconcile(fixture);

      expect(report.decision).toEqual({ kind: "BLOCKED", exitCode: 20 });
      expect(report.findings.map((finding) => finding.code))
        .toContain(variant === "wrong" ? "ANCHOR_IDENTITY" : "ANCHOR_MULTIPLICITY");
    },
  );

  it("blocks an unknown journal row newer than the predecessor", async () => {
    const fixture = await buildReconcileFixture();
    fixture.snapshot.journal_rows.push({
      id: "999",
      hash: "f".repeat(64),
      created_at: "1784764800000",
    });

    const report = reconcile(fixture);

    expect(report.decision).toEqual({ kind: "BLOCKED", exitCode: 20 });
    expect(report.findings.map((finding) => finding.code))
      .toContain("UNKNOWN_LATER_JOURNAL_ROW");
  });

  it("blocks a known timestamp carrying the wrong hash", async () => {
    const fixture = await buildReconcileFixture();
    const target = fixture.manifest.find((entry) => entry.id === "0029")!;
    fixture.snapshot.journal_rows.find(
      (row) => row.created_at === String(target.when),
    )!.hash = "0".repeat(64);

    const report = reconcile(fixture);

    expect(migrationStatus(report, "0029")).toBe("BLOCKED_JOURNAL_CONFLICT");
    expect(report.findings.map((finding) => finding.code))
      .toContain("JOURNAL_HASH_CONFLICT");
  });
});

describe("reconcile repository and schema evidence", () => {
  it("blocks snapshot migration identity drift", async () => {
    const fixture = await buildReconcileFixture();
    fixture.snapshot.migrations.find((entry) => entry.id === "0027")!.sha256 =
      "0".repeat(64);

    const report = reconcile(fixture);

    expect(migrationStatus(report, "0027")).toBe("BLOCKED_FILE_IDENTITY");
    expect(report.findings.map((finding) => finding.code))
      .toContain("FILE_HASH_MISMATCH");
  });

  it("blocks duplicate snapshot migration identity evidence", async () => {
    const fixture = await buildReconcileFixture();
    fixture.snapshot.migrations.push(structuredClone(
      fixture.snapshot.migrations.find((entry) => entry.id === "0027")!,
    ));

    const report = reconcile(fixture);

    expect(migrationStatus(report, "0027")).toBe("BLOCKED_FILE_IDENTITY");
    expect(report.findings.map((finding) => finding.code))
      .toContain("FILE_IDENTITY_MULTIPLICITY");
  });

  it("blocks a missing contract-owned column", async () => {
    const fixture = await buildReconcileFixture();
    fixture.snapshot.columns = fixture.snapshot.columns.filter(
      (column) => !(column.table === "orders" && column.name === "pickup_phone"),
    );

    const report = reconcile(fixture);

    expect(migrationStatus(report, "0032")).toBe("BLOCKED_SCHEMA_DRIFT");
    expect(report.findings.map((finding) => finding.code)).toContain("COLUMN_MISSING");
  });

  it("blocks duplicate contract-owned column evidence", async () => {
    const fixture = await buildReconcileFixture();
    fixture.snapshot.columns.push(structuredClone(
      fixture.snapshot.columns.find(
        (column) => column.table === "orders" && column.name === "pickup_phone",
      )!,
    ));

    const report = reconcile(fixture);

    expect(migrationStatus(report, "0032")).toBe("BLOCKED_EVIDENCE_INCOMPLETE");
    expect(report.findings.map((finding) => finding.code))
      .toContain("COLUMN_EVIDENCE_MULTIPLICITY");
  });

  it("blocks a required table with the wrong engine", async () => {
    const fixture = await buildReconcileFixture();
    fixture.snapshot.tables.find((table) => table.name === "order_payments")!.engine =
      "MyISAM";

    const report = reconcile(fixture);

    expect(migrationStatus(report, "0027")).toBe("BLOCKED_SCHEMA_DRIFT");
    expect(report.findings.map((finding) => finding.code))
      .toContain("TABLE_ENGINE_MISMATCH");
  });

  it("reports an unrelated extra index without blocking", async () => {
    const fixture = await buildReconcileFixture();
    fixture.snapshot.indexes.push({
      table: "orders",
      name: "orders_unrelated_observation_idx",
      unique: false,
      index_type: "BTREE",
      columns: [{ name: "status", order: "ASC", prefix_length: null }],
    });

    const report = reconcile(fixture);

    expect(report.decision).toEqual({ kind: "REGISTERED_EXACT", exitCode: 0 });
    expect(report.findings).toContainEqual(expect.objectContaining({
      code: "EXTRA_INDEX",
      blocking: false,
      actual: "orders_unrelated_observation_idx",
    }));
  });

  it("blocks a contract-owned index with the wrong column order", async () => {
    const fixture = await buildReconcileFixture();
    fixture.snapshot.indexes.find(
      (index) => index.name === "pos_idempotency_store_created_idx",
    )!.columns.reverse();

    expect(reconcile(fixture).findings.map((finding) => finding.code))
      .toContain("INDEX_MISMATCH");
  });

  it("blocks a foreign key with the wrong referential action", async () => {
    const fixture = await buildReconcileFixture();
    fixture.snapshot.foreign_keys.find(
      (foreignKey) => foreignKey.name === "order_payments_order_fk",
    )!.on_delete = "RESTRICT";

    expect(reconcile(fixture).findings.map((finding) => finding.code))
      .toContain("FOREIGN_KEY_MISMATCH");
  });

  it("reports an unknown referential action without aborting reconciliation", async () => {
    const fixture = await buildReconcileFixture();
    fixture.snapshot.foreign_keys.find(
      (foreignKey) => foreignKey.name === "order_payments_order_fk",
    )!.on_delete = "INVALID";

    expect(() => reconcile(fixture)).not.toThrow();
    expect(reconcile(fixture).findings.map((finding) => finding.code))
      .toContain("FOREIGN_KEY_MISMATCH");
  });

  it("blocks a changed CHECK constraint", async () => {
    const fixture = await buildReconcileFixture();
    fixture.snapshot.checks[0]!.clause = "1=1";

    expect(reconcile(fixture).findings.map((finding) => finding.code))
      .toContain("CHECK_MISMATCH");
  });

  it("blocks a changed generated-column expression", async () => {
    const fixture = await buildReconcileFixture();
    fixture.snapshot.columns.find(
      (column) => column.table === "inventory" && column.name === "variant_scope_key",
    )!.generation_expression = "coalesce(variant_id, 'wrong')";

    expect(reconcile(fixture).findings.map((finding) => finding.code))
      .toContain("COLUMN_MISMATCH");
  });

  it("blocks a migration helper routine that survived", async () => {
    const fixture = await buildReconcileFixture();
    fixture.snapshot.routines.push({
      name: "pos_task11_preflight",
      type: "PROCEDURE",
    });

    expect(reconcile(fixture).findings.map((finding) => finding.code))
      .toContain("ROUTINE_PRESENT");
  });
});

describe("reconcile data and collation evidence", () => {
  it.each<AggregateName>([
    "legacy_orders_missing_payment",
    "product_variant_mismatch",
    "stock_total_mismatch",
    "duplicate_inventory_scope",
    "unambiguous_backfill_missing",
    "ambiguous_location_exception_missing",
    "legacy_pos_attribution_missing",
  ])("blocks nonzero aggregate %s", async (aggregateName) => {
    const fixture = await buildReconcileFixture();
    fixture.snapshot.aggregates.find((item) => item.name === aggregateName)!.count = "1";

    const report = reconcile(fixture);

    expect(report.decision).toEqual({ kind: "BLOCKED", exitCode: 20 });
    expect(report.findings).toContainEqual(expect.objectContaining({
      code: "AGGREGATE_NONZERO",
      actual: "1",
    }));
  });

  it("blocks missing aggregate evidence", async () => {
    const fixture = await buildReconcileFixture();
    fixture.snapshot.aggregates = fixture.snapshot.aggregates.filter(
      (item) => item.name !== "stock_total_mismatch",
    );

    const report = reconcile(fixture);

    expect(migrationStatus(report, "0031")).toBe("BLOCKED_EVIDENCE_INCOMPLETE");
    expect(report.findings.map((finding) => finding.code))
      .toContain("AGGREGATE_MISSING");
  });

  it("blocks production collation drift on a policy-owned table", async () => {
    const fixture = await buildReconcileFixture();
    fixture.snapshot.tables.find(
      (table) => table.name === "pos_idempotency_keys",
    )!.collation = "utf8mb4_unicode_ci";

    const report = reconcile(fixture);

    expect(migrationStatus(report, "0026")).toBe("BLOCKED_SCHEMA_DRIFT");
    expect(report.findings.map((finding) => finding.code))
      .toContain("COLLATION_MISMATCH");
  });

  it("accepts migration-native collation only for the raw fixture profile", async () => {
    const fixture = await buildReconcileFixture("migration-native");

    expect(reconcile(fixture).decision)
      .toEqual({ kind: "REGISTERED_EXACT", exitCode: 0 });
  });

  it("preserves all findings instead of stopping after the first mismatch", async () => {
    const fixture = await buildReconcileFixture();
    fixture.snapshot.columns = fixture.snapshot.columns.filter(
      (column) => !(column.table === "orders" && column.name === "pickup_phone"),
    );
    fixture.snapshot.aggregates.find(
      (item) => item.name === "legacy_orders_missing_payment",
    )!.count = "2";
    fixture.snapshot.tables.find(
      (table) => table.name === "pos_idempotency_keys",
    )!.collation = "utf8mb4_unicode_ci";
    refreshFixtureFingerprint(fixture.snapshot);

    const codes = reconcile(fixture).findings.map((finding) => finding.code);

    expect(codes).toContain("COLUMN_MISSING");
    expect(codes).toContain("AGGREGATE_NONZERO");
    expect(codes).toContain("COLLATION_MISMATCH");
  });

  it("blocks textual-column collation drift even when table collation is exact", async () => {
    const fixture = await buildReconcileFixture();
    fixture.snapshot.columns.find(
      (column) =>
        column.table === "pos_idempotency_keys" && column.collation !== null,
    )!.collation = "utf8mb4_unicode_ci";

    expect(reconcile(fixture).findings.map((finding) => finding.code))
      .toContain("COLLATION_MISMATCH");
  });

  it("blocks a snapshot that is no longer freshness-eligible", async () => {
    const fixture = await buildReconcileFixture();

    const report = reconcile({
      ...fixture,
      freshness: { eligible: false, reason: "SNAPSHOT_EXPIRED" },
    });

    expect(report.decision).toEqual({ kind: "BLOCKED", exitCode: 20 });
    expect(report.findings.map((finding) => finding.code))
      .toContain("SNAPSHOT_EXPIRED");
  });

  it("keeps the original decision when the snapshot commit matches the repository commit", async () => {
    const fixture = await buildReconcileFixture();

    const report = reconcile({
      ...fixture,
      repositoryCommit: fixture.snapshot.repository_commit,
    });

    expect(report.decision).toEqual({ kind: "REGISTERED_EXACT", exitCode: 0 });
    expect(report.findings.map((finding) => finding.code))
      .not.toContain("REPOSITORY_COMMIT_MISMATCH");
  });

  it("blocks with exit 20 when the snapshot commit differs from the repository commit", async () => {
    const fixture = await buildReconcileFixture();

    const report = reconcile({
      ...fixture,
      repositoryCommit: "a".repeat(40),
    });

    expect(report.decision).toEqual({ kind: "BLOCKED", exitCode: 20 });
    const mismatch = report.findings.find(
      (finding) => finding.code === "REPOSITORY_COMMIT_MISMATCH",
    );
    expect(mismatch).toBeDefined();
    expect(mismatch!.migration).toBe("snapshot");
    expect(mismatch!.category).toBe("identity");
    expect(mismatch!.blocking).toBe(true);
    expect(mismatch!.expected).toBe("a".repeat(40));
    expect(mismatch!.actual).toBe(fixture.snapshot.repository_commit);
  });

  it("blocks a commit mismatch even when the journal suffix would otherwise be repair-eligible", async () => {
    const fixture = await buildReconcileFixture();
    removeJournalRowsFrom(fixture, "0026");

    const report = reconcile({
      ...fixture,
      repositoryCommit: "a".repeat(40),
    });

    expect(report.decision).toEqual({ kind: "BLOCKED", exitCode: 20 });
    expect(report.findings.map((finding) => finding.code))
      .toContain("REPOSITORY_COMMIT_MISMATCH");
    expect(renderProposedSql(report, {
      manifest: fixture.manifest,
      generatedAt: "2026-07-26T14:00:00.000Z",
    })).toBeNull();
  });
});
