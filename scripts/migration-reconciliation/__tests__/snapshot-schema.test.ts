import { describe, expect, it } from "vitest";

import { fingerprintSnapshot } from "../canonical-json";
import {
  evaluateSnapshotFreshness,
  parseSnapshot,
} from "../snapshot-schema";

function validSnapshot(overrides: Record<string, unknown> = {}) {
  const value = {
    format_version: 1,
    source_kind: "fixture",
    fixture_mode: true,
    captured_at: "2026-07-26T10:00:00.000Z",
    database_identity_fingerprint: "a".repeat(64),
    server_version: "8.0.0-fixture",
    repository_commit: "b".repeat(40),
    collation_profile: "migration-native",
    migrations: [],
    journal_rows: [],
    tables: [],
    columns: [],
    indexes: [],
    foreign_keys: [],
    checks: [],
    routines: [],
    aggregates: [],
    content_fingerprint: "",
    ...overrides,
  };
  value.content_fingerprint = fingerprintSnapshot(value);
  return value;
}

describe("parseSnapshot", () => {
  it("accepts a complete, fingerprinted fixture snapshot", () => {
    expect(parseSnapshot(validSnapshot()).format_version).toBe(1);
  });

  it("rejects unknown top-level evidence instead of silently ignoring it", () => {
    expect(() => parseSnapshot(validSnapshot({ raw_orders: [] }))).toThrow(/unrecognized key/i);
  });

  it("rejects a missing required evidence collection", () => {
    const value = validSnapshot();
    delete (value as Partial<typeof value>).columns;

    expect(() => parseSnapshot(value)).toThrow(/columns/i);
  });

  it("rejects a content fingerprint mismatch", () => {
    const value = validSnapshot();
    value.content_fingerprint = "0".repeat(64);

    expect(() => parseSnapshot(value)).toThrow(/fingerprint/i);
  });

  it("rejects fixture mode for a live MySQL snapshot", () => {
    expect(() => parseSnapshot(validSnapshot({
      source_kind: "live_mysql",
      fixture_mode: true,
    }))).toThrow(/fixture_mode/i);
  });

  it.each(["password", "hostname", "username", "dsn", "grants"])(
    "rejects forbidden identity or secret field %s",
    (field) => {
      expect(() => parseSnapshot(validSnapshot({ [field]: "sensitive" })))
        .toThrow(/unrecognized key/i);
    },
  );
});

describe("evaluateSnapshotFreshness", () => {
  const now = new Date("2026-07-26T12:00:00.000Z");

  it("accepts a live snapshot at the inclusive 24-hour boundary", () => {
    const snapshot = parseSnapshot(validSnapshot({
      source_kind: "live_mysql",
      fixture_mode: false,
      captured_at: "2026-07-25T12:00:00.000Z",
    }));

    expect(evaluateSnapshotFreshness(snapshot, now)).toEqual({ eligible: true });
  });

  it("marks a live snapshot older than 24 hours ineligible", () => {
    const snapshot = parseSnapshot(validSnapshot({
      source_kind: "live_mysql",
      fixture_mode: false,
      captured_at: "2026-07-25T11:59:59.999Z",
    }));

    expect(evaluateSnapshotFreshness(snapshot, now)).toEqual({
      eligible: false,
      reason: "SNAPSHOT_EXPIRED",
    });
  });

  it("accepts a non-expiring fixture regardless of age", () => {
    const snapshot = parseSnapshot(validSnapshot({
      captured_at: "2020-01-01T00:00:00.000Z",
    }));

    expect(evaluateSnapshotFreshness(snapshot, now)).toEqual({ eligible: true });
  });

  it("accepts a live snapshot within the 5-minute future tolerance", () => {
    const snapshot = parseSnapshot(validSnapshot({
      source_kind: "live_mysql",
      fixture_mode: false,
      captured_at: "2026-07-26T12:04:00.000Z",
    }));

    expect(evaluateSnapshotFreshness(snapshot, now)).toEqual({ eligible: true });
  });

  it("marks a live snapshot beyond the 5-minute future tolerance ineligible", () => {
    const snapshot = parseSnapshot(validSnapshot({
      source_kind: "live_mysql",
      fixture_mode: false,
      captured_at: "2026-07-26T12:06:00.000Z",
    }));

    expect(evaluateSnapshotFreshness(snapshot, now)).toEqual({
      eligible: false,
      reason: "SNAPSHOT_FROM_FUTURE",
    });
  });
});
