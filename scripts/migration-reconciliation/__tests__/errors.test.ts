import { describe, expect, it } from "vitest";

import {
  MigrationReconciliationError,
  redactSecrets,
} from "../errors";

describe("MigrationReconciliationError", () => {
  it("keeps the stable operational error code for CLI exit handling", () => {
    const error = new MigrationReconciliationError(
      "QUERY_ERROR",
      "Evidence query failed",
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MigrationReconciliationError");
    expect(error.code).toBe("QUERY_ERROR");
    expect(error.message).toBe("Evidence query failed");
  });
});

describe("redactSecrets", () => {
  it("redacts every configured secret without changing unrelated text", () => {
    expect(redactSecrets(
      "connect db.example as audit_user with s3cret failed",
      ["db.example", "audit_user", "s3cret"],
    )).toBe("connect [REDACTED] as [REDACTED] with [REDACTED] failed");
  });

  it("ignores empty and absent secret values", () => {
    expect(redactSecrets("safe message", [undefined, ""])).toBe("safe message");
  });
});
