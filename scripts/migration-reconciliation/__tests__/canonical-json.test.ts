import { describe, expect, it } from "vitest";

import { canonicalStringify, fingerprintSnapshot } from "../canonical-json";

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
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
}

describe("canonicalStringify", () => {
  it("sorts object keys recursively while preserving array order", () => {
    expect(canonicalStringify({ z: 1, a: { y: 2, x: 3 }, rows: [{ b: 2, a: 1 }] }))
      .toBe('{"a":{"x":3,"y":2},"rows":[{"a":1,"b":2}],"z":1}');
  });

  it.each([
    ["undefined", { value: undefined }],
    ["NaN", { value: Number.NaN }],
    ["Infinity", { value: Number.POSITIVE_INFINITY }],
    ["unsafe integer", { value: Number.MAX_SAFE_INTEGER + 1 }],
    ["date", { value: new Date("2026-07-26T00:00:00.000Z") }],
    ["sparse array", { value: Array(1) }],
  ])("rejects %s because it has no stable canonical JSON representation", (_name, value) => {
    expect(() => canonicalStringify(value)).toThrow();
  });

  it("rejects cyclic objects", () => {
    const value: Record<string, unknown> = {};
    value.self = value;

    expect(() => canonicalStringify(value)).toThrow(/cyclic/i);
  });
});

describe("fingerprintSnapshot", () => {
  it("excludes capture time and the fingerprint field itself", () => {
    const a = snapshot({
      captured_at: "2026-07-26T10:00:00.000Z",
      content_fingerprint: "old",
    });
    const b = snapshot({
      captured_at: "2026-07-26T11:00:00.000Z",
      content_fingerprint: "new",
    });

    expect(fingerprintSnapshot(a)).toBe(fingerprintSnapshot(b));
  });

  it("changes when evidence content changes", () => {
    expect(fingerprintSnapshot(snapshot({ server_version: "8.0.40" })))
      .not.toBe(fingerprintSnapshot(snapshot({ server_version: "8.0.41" })));
  });
});
