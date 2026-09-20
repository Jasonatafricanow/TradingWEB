import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getCatalogKeys,
  getPlaceholderNames,
  shellCatalogs,
  translate,
} from "@/i18n";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("typed shell catalog contract", () => {
  if (false) {
    // @ts-expect-error placeholder-bearing keys require their declared params
    translate("en", "errors.inventory_insufficient");
    // @ts-expect-error parameter-free keys reject interpolation data
    translate("en", "nav.dashboard", { available: 1 });
  }

  it("keeps direct non-empty key coverage identical in zh, en, and pt", () => {
    const canonicalKeys = getCatalogKeys(shellCatalogs.en);

    expect(getCatalogKeys(shellCatalogs.zh)).toEqual(canonicalKeys);
    expect(getCatalogKeys(shellCatalogs.pt)).toEqual(canonicalKeys);

    for (const locale of ["zh", "en", "pt"] as const) {
      for (const key of canonicalKeys) {
        expect(shellCatalogs[locale][key].trim(), `${locale}:${key}`).not.toBe("");
        expect(shellCatalogs[locale][key], `${locale}:${key}`).not.toBe(key);
      }
    }
  });

  it("keeps placeholder names and multiplicity identical across locales", () => {
    for (const key of getCatalogKeys(shellCatalogs.en)) {
      const expected = getPlaceholderNames(shellCatalogs.en[key]);
      expect(getPlaceholderNames(shellCatalogs.zh[key]), `zh:${key}`).toEqual(expected);
      expect(getPlaceholderNames(shellCatalogs.pt[key]), `pt:${key}`).toEqual(expected);
    }
  });

  it("interpolates only the declared parameters", () => {
    expect(
      translate("en", "errors.inventory_insufficient", {
        available: 3,
        requested: 5,
      }),
    ).toBe("Only 3 available; 5 requested.");

    expect(() =>
      translate("en", "errors.inventory_insufficient", { available: 3 } as never),
    ).toThrow(/missing.*requested/i);

    expect(() =>
      translate("en", "errors.inventory_insufficient", {
        available: 3,
        requested: 5,
        pin: "1234",
      } as never),
    ).toThrow(/unexpected.*pin/i);
  });

  it("throws for missing keys outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(() => translate("en", "nav.not_configured" as never)).toThrow(
      /missing translation key/i,
    );
  });

  it("uses a localized safe fallback in production without leaking a raw key", () => {
    vi.stubEnv("NODE_ENV", "production");
    const result = translate("pt", "nav.not_configured" as never);

    expect(result).toBe(shellCatalogs.pt["common.unexpected_error"]);
    expect(result).not.toContain("nav.not_configured");
    expect(result).not.toBe("Not Configured");
  });
});
