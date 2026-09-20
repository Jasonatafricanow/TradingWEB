import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MigrationReconciliationError } from "../errors";
import { reconcile } from "../reconcile";
import { evaluateSnapshotFreshness } from "../snapshot-schema";
import { JsonSnapshotSource } from "../sources/json-snapshot-source";
import {
  buildReconcileFixture,
  refreshFixtureFingerprint,
} from "./reconcile-fixture";

const temporaryDirectories: string[] = [];

async function temporarySnapshotPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "migration-json-source-"));
  temporaryDirectories.push(directory);
  return join(directory, "snapshot.json");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("JsonSnapshotSource", () => {
  it("loads a valid strict fixture and verifies its fingerprint", async () => {
    const fixture = await buildReconcileFixture();
    const path = await temporarySnapshotPath();
    await writeFile(path, JSON.stringify(fixture.snapshot), "utf8");

    const loaded = await JsonSnapshotSource.load(
      path,
      new Date("2026-07-26T13:00:00.000Z"),
    );

    expect(loaded).toEqual(fixture.snapshot);
  });

  it("maps malformed JSON to a redacted PARSE_ERROR", async () => {
    const path = await temporarySnapshotPath();
    const raw = '{"password":"do-not-leak"';
    await writeFile(path, raw, "utf8");

    const error = await JsonSnapshotSource.load(path, new Date())
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MigrationReconciliationError);
    expect(error).toMatchObject({ code: "PARSE_ERROR" });
    expect(String(error)).not.toContain(path);
    expect(String(error)).not.toContain(raw);
    expect(String(error)).not.toContain("do-not-leak");
    expect((error as Error).cause).toBeUndefined();
  });

  it("rejects unknown evidence fields instead of discarding them", async () => {
    const fixture = await buildReconcileFixture();
    const path = await temporarySnapshotPath();
    const value = {
      ...fixture.snapshot,
      unexpected_evidence: [{ raw_business_row: "secret" }],
    };
    await writeFile(path, JSON.stringify(value), "utf8");

    await expect(JsonSnapshotSource.load(path, new Date()))
      .rejects.toMatchObject({ code: "PARSE_ERROR" });
  });

  it("rejects missing collections instead of filling defaults", async () => {
    const fixture = await buildReconcileFixture();
    const path = await temporarySnapshotPath();
    const value = structuredClone(fixture.snapshot) as unknown as Record<string, unknown>;
    delete value.checks;
    await writeFile(path, JSON.stringify(value), "utf8");

    await expect(JsonSnapshotSource.load(path, new Date()))
      .rejects.toMatchObject({ code: "PARSE_ERROR" });
  });

  it("rejects a wrong fingerprint instead of replacing it", async () => {
    const fixture = await buildReconcileFixture();
    const path = await temporarySnapshotPath();
    fixture.snapshot.content_fingerprint = "0".repeat(64);
    await writeFile(path, JSON.stringify(fixture.snapshot), "utf8");

    await expect(JsonSnapshotSource.load(path, new Date()))
      .rejects.toMatchObject({ code: "PARSE_ERROR" });
    expect(JSON.parse(await readFile(path, "utf8")).content_fingerprint)
      .toBe("0".repeat(64));
  });

  it("loads stale live evidence for history but freshness blocks reconciliation", async () => {
    const fixture = await buildReconcileFixture();
    const path = await temporarySnapshotPath();
    fixture.snapshot.source_kind = "live_mysql";
    fixture.snapshot.fixture_mode = false;
    fixture.snapshot.captured_at = "2026-07-24T12:00:00.000Z";
    refreshFixtureFingerprint(fixture.snapshot);
    await writeFile(path, JSON.stringify(fixture.snapshot), "utf8");
    const now = new Date("2026-07-26T13:00:00.000Z");

    const loaded = await JsonSnapshotSource.load(path, now);
    const report = reconcile({
      ...fixture,
      snapshot: loaded,
      freshness: evaluateSnapshotFreshness(loaded, now),
    });

    expect(report.decision).toEqual({ kind: "BLOCKED", exitCode: 20 });
    expect(report.findings.map((finding) => finding.code))
      .toContain("SNAPSHOT_EXPIRED");
  });
});
