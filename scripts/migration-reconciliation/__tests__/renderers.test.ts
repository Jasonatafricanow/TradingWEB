import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { reconcile } from "../reconcile";
import { renderProposedSql } from "../render/proposed-sql";
import { renderReportJson } from "../render/report-json";
import { renderReportMarkdown } from "../render/report-markdown";
import { writeArtifactBundle } from "../render/write-artifacts";
import type { Finding, ReconciliationReport } from "../types";
import {
  buildReconcileFixture,
  removeJournalRowsFrom,
} from "./reconcile-fixture";

const temporaryDirectories: string[] = [];

async function temporaryParent(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "migration-artifacts-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

function withSecretFinding(report: ReconciliationReport): ReconciliationReport {
  const secretFinding: Finding = {
    migration: "snapshot",
    category: "evidence",
    code: "TEST_REDACTION",
    expected: null,
    actual: "DB_PASSWORD=do-not-render",
    blocking: false,
  };
  return {
    ...report,
    findings: [...report.findings, secretFinding],
  };
}

describe("audit report renderers", () => {
  it("renders deterministic, secret-redacted JSON and Markdown", async () => {
    const fixture = await buildReconcileFixture();
    removeJournalRowsFrom(fixture, "0026");
    const report = withSecretFinding(reconcile(fixture));

    const json = renderReportJson(report);
    const markdown = renderReportMarkdown(report);

    expect(json).toBe(renderReportJson(report));
    expect(json).not.toContain("DB_PASSWORD");
    expect(json).not.toContain("do-not-render");
    expect(markdown).toContain("Overall decision: JOURNAL_REPAIR_ELIGIBLE");
    expect(markdown).toContain("Reconstructed collation evidence");
    expect(markdown).not.toContain("DB_PASSWORD");
    expect(markdown).not.toContain("do-not-render");
  });
});

describe("proposed SQL renderer", () => {
  it("returns null unless reconciliation is repair-eligible", async () => {
    const fixture = await buildReconcileFixture();
    const exact = reconcile(fixture);
    fixture.snapshot.aggregates[0]!.count = "1";
    const blocked = reconcile(fixture);
    const options = {
      manifest: fixture.manifest,
      generatedAt: "2026-07-26T14:00:00.000Z",
    };

    expect(renderProposedSql(exact, options)).toBeNull();
    expect(renderProposedSql(blocked, options)).toBeNull();
  });

  it("renders one guarded insert bound to the exact snapshot and eight-row suffix", async () => {
    const fixture = await buildReconcileFixture();
    removeJournalRowsFrom(fixture, "0026");
    const report = reconcile(fixture);
    const sql = renderProposedSql(report, {
      manifest: fixture.manifest,
      generatedAt: "2026-07-26T14:00:00.000Z",
    })!;
    const anchor = fixture.manifest.find((entry) => entry.id === "0025")!;

    expect(sql).toContain(`Repository commit: ${report.repository_commit}`);
    expect(sql).toContain(`Snapshot fingerprint: ${report.snapshot_fingerprint}`);
    expect(sql).toContain("SELECT GET_LOCK(");
    expect(sql).toContain(anchor.sha256);
    expect(sql).toContain(String(anchor.when));
    expect(sql.match(/INSERT INTO `__drizzle_migrations`/g)).toHaveLength(1);
    expect(sql).toContain("ROW_COUNT()");
    expect(sql).toContain("expected_affected_rows = 8");
    expect(sql).toContain("RELEASE_LOCK");
    expect(sql).toContain("postflight");
    expect(sql).toContain(
      "SELECT COUNT(*) AS exact_prefix_rows_must_equal_1\nFROM `__drizzle_migrations`",
    );
    expect(sql.match(/BINARY `hash` = BINARY @expected_prefix_hash/g))
      .toHaveLength(2);
    expect(sql).not.toMatch(/FROM `__drizzle_migrations`;\nWHERE/);
    for (const entry of fixture.manifest.filter((item) => item.id !== "0025")) {
      expect(sql).toContain(entry.sha256);
      expect(sql).toContain(String(entry.when));
    }
    expect(sql).not.toMatch(/\b(?:ALTER|CREATE|DROP|UPDATE|DELETE|REPLACE)\b/i);
    expect(sql).not.toContain("DB_PASSWORD");
    expect(sql).not.toMatch(/\b(?:orders|products|inventory|staff)\b/i);
  });

  it("renders only the actual later eligible suffix", async () => {
    const fixture = await buildReconcileFixture();
    removeJournalRowsFrom(fixture, "0030");
    const sql = renderProposedSql(reconcile(fixture), {
      manifest: fixture.manifest,
      generatedAt: "2026-07-26T14:00:00.000Z",
    })!;

    expect(sql).toContain("expected_affected_rows = 4");
    expect(sql).toContain(
      fixture.manifest.find((entry) => entry.id === "0030")!.sha256,
    );
    expect(sql).not.toContain(
      fixture.manifest.find((entry) => entry.id === "0028")!.sha256,
    );
  });

  it("repair SQL binds journal insert to acquired advisory lock", async () => {
    const fixture = await buildReconcileFixture();
    removeJournalRowsFrom(fixture, "0026");
    const sql = renderProposedSql(reconcile(fixture), {
      manifest: fixture.manifest,
      generatedAt: "2026-07-26T14:00:00.000Z",
    })!;

    expect(sql).toContain(
      "SELECT GET_LOCK(@repair_lock_name, 0) INTO @repair_lock_acquired;",
    );
    const insertBlock = sql.slice(
      sql.indexOf("INSERT INTO `__drizzle_migrations`"),
      sql.indexOf("SELECT ROW_COUNT()"),
    );
    expect(insertBlock).toContain("@repair_lock_acquired = 1");
    expect(insertBlock).toContain(
      "AND (",
    );
    const releaseStatement = sql.slice(sql.indexOf("SELECT RELEASE_LOCK"));
    expect(releaseStatement).toContain("WHERE @repair_lock_acquired = 1");
    expect(sql).not.toMatch(
      /SELECT RELEASE_LOCK\([^)]*\) AS advisory_lock_release_must_equal_1;\n/,
    );
  });
});

describe("artifact bundle writer", () => {
  it("writes a complete non-overwriting bundle with sorted checksums", async () => {
    const parent = await temporaryParent();
    const outputDirectory = join(parent, "bundle");
    const fixture = await buildReconcileFixture();
    removeJournalRowsFrom(fixture, "0026");
    const report = reconcile(fixture);
    const proposedSql = renderProposedSql(report, {
      manifest: fixture.manifest,
      generatedAt: "2026-07-26T14:00:00.000Z",
    });

    const paths = await writeArtifactBundle({
      outputDirectory,
      snapshot: fixture.snapshot,
      report,
      proposedSql,
    });

    expect(paths.proposedSql).toBe(join(outputDirectory, "proposed-journal-repair.sql"));
    expect(await readdir(outputDirectory)).toEqual([
      "checksums.sha256",
      "proposed-journal-repair.sql",
      "report.json",
      "report.md",
      "snapshot.json",
    ]);
    const checksumLines = (await readFile(paths.checksums, "utf8")).trim().split("\n");
    expect(checksumLines.map((line) => line.split("  ")[1])).toEqual([
      "proposed-journal-repair.sql",
      "report.json",
      "report.md",
      "snapshot.json",
    ]);
    for (const line of checksumLines) {
      const [expectedHash, filename] = line.split("  ");
      const content = await readFile(join(outputDirectory, filename!), "utf8");
      expect(createHash("sha256").update(content).digest("hex")).toBe(expectedHash);
    }
    expect((await readdir(outputDirectory)).some((name) => name.includes(".tmp-")))
      .toBe(false);
  });

  it("refuses to overwrite any existing final artifact", async () => {
    const parent = await temporaryParent();
    const outputDirectory = join(parent, "bundle");
    await mkdir(outputDirectory);
    await writeFile(join(outputDirectory, "report.json"), "preserve-me", "utf8");
    const fixture = await buildReconcileFixture();

    await expect(writeArtifactBundle({
      outputDirectory,
      snapshot: fixture.snapshot,
      report: reconcile(fixture),
      proposedSql: null,
    })).rejects.toMatchObject({ code: "ARTIFACT_WRITE_ERROR" });
    expect(await readFile(join(outputDirectory, "report.json"), "utf8"))
      .toBe("preserve-me");
  });

  it("does not recursively create a missing parent", async () => {
    const parent = await temporaryParent();
    const outputDirectory = join(parent, "missing-parent", "bundle");
    const fixture = await buildReconcileFixture();

    await expect(writeArtifactBundle({
      outputDirectory,
      snapshot: fixture.snapshot,
      report: reconcile(fixture),
      proposedSql: null,
    })).rejects.toMatchObject({ code: "ARTIFACT_WRITE_ERROR" });
  });
});
