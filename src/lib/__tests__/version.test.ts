import { describe, expect, it } from "vitest";
import { resolveVersionInfo } from "@/lib/version";
import {
  VERSION_DISMISS_COOLDOWN_MS,
  dismissedStorageKey,
  isDismissCoolingDown,
  isNewBuildAvailable,
  markDismissed,
} from "@/lib/version-check";

describe("resolveVersionInfo", () => {
  it("prefers build-info metadata over the raw Next BUILD_ID", () => {
    const info = resolveVersionInfo({
      packageVersion: "1.2.3",
      buildInfo: {
        buildId: "build-from-info",
        gitCommit: "abc123",
        gitBranch: "main",
        builtAt: "2026-11-11T00:00:00.000Z",
      },
      nextBuildId: "build-from-next",
      nodeEnv: "production",
      startedAt: "2026-11-11T01:00:00.000Z",
    });
    expect(info).toEqual({
      appVersion: "1.2.3",
      buildId: "build-from-info",
      gitCommit: "abc123",
      gitBranch: "main",
      builtAt: "2026-11-11T00:00:00.000Z",
      nodeEnv: "production",
      startedAt: "2026-11-11T01:00:00.000Z",
    });
  });

  it("falls back to BUILD_ID when build-info is missing (legacy artifacts)", () => {
    const info = resolveVersionInfo({
      packageVersion: "1.0.0",
      buildInfo: null,
      nextBuildId: "legacy-build",
      nodeEnv: "production",
    });
    expect(info.buildId).toBe("legacy-build");
    expect(info.gitCommit).toBeNull();
    expect(info.builtAt).toBeNull();
  });

  it("ignores non-string metadata fields", () => {
    const info = resolveVersionInfo({
      packageVersion: "1.0.0",
      buildInfo: { buildId: 42, gitCommit: "", builtAt: null },
      nextBuildId: "fallback",
    });
    expect(info.buildId).toBe("fallback");
    expect(info.gitCommit).toBeNull();
    expect(info.builtAt).toBeNull();
  });

  it("works without any build artifacts (dev mode)", () => {
    const info = resolveVersionInfo({ packageVersion: "1.0.0" });
    expect(info.appVersion).toBe("1.0.0");
    expect(info.buildId).toBeNull();
    expect(info.nodeEnv).toBe("development");
  });
});

describe("isNewBuildAvailable", () => {
  it("detects a changed build id", () => {
    expect(isNewBuildAvailable("old", { buildId: "new" })).toBe(true);
  });

  it("stays silent for the same build", () => {
    expect(isNewBuildAvailable("same", { buildId: "same" })).toBe(false);
  });

  it("stays silent when either side lacks a build id", () => {
    expect(isNewBuildAvailable(null, { buildId: "new" })).toBe(false);
    expect(isNewBuildAvailable("old", { buildId: null })).toBe(false);
    expect(isNewBuildAvailable("old", null)).toBe(false);
    expect(isNewBuildAvailable(undefined, undefined)).toBe(false);
  });
});

describe("dismiss cooldown", () => {
  function memoryStorage() {
    const map = new Map<string, string>();
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
    };
  }

  it("is not cooling down before any dismissal", () => {
    const storage = memoryStorage();
    expect(isDismissCoolingDown(storage, "build-a", 1_000)).toBe(false);
  });

  it("suppresses repeats within the cooldown window", () => {
    const storage = memoryStorage();
    markDismissed(storage, "build-a", 1_000);
    expect(isDismissCoolingDown(storage, "build-a", 1_000 + 60_000)).toBe(true);
    expect(
      isDismissCoolingDown(
        storage,
        "build-a",
        1_000 + VERSION_DISMISS_COOLDOWN_MS - 1,
      ),
    ).toBe(true);
  });

  it("allows the prompt again after the cooldown", () => {
    const storage = memoryStorage();
    markDismissed(storage, "build-a", 1_000);
    expect(
      isDismissCoolingDown(
        storage,
        "build-a",
        1_000 + VERSION_DISMISS_COOLDOWN_MS + 1,
      ),
    ).toBe(false);
  });

  it("tracks each build independently", () => {
    const storage = memoryStorage();
    markDismissed(storage, "build-a", 1_000);
    expect(isDismissCoolingDown(storage, "build-b", 2_000)).toBe(false);
    expect(dismissedStorageKey("build-a")).not.toBe(dismissedStorageKey("build-b"));
  });

  it("tolerates corrupted storage values", () => {
    const storage = {
      getItem: () => "not-a-number",
      setItem: () => undefined,
    };
    expect(isDismissCoolingDown(storage, "build-a", 1_000)).toBe(false);
  });

  it("tolerates unavailable storage", () => {
    const storage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(isDismissCoolingDown(storage, "build-a", 1_000)).toBe(false);
    expect(() => markDismissed(storage, "build-a", 1_000)).not.toThrow();
  });
});