import { describe, expect, it } from "vitest";
import { DEFAULT_PROGRAM_SETTINGS, mergeProgramSettings, parseProgramSettings, ProgramSettingsError } from "../program-settings";

describe("program settings", () => {
  it("everything is off until an admin switches it on", () => {
    const parsed = parseProgramSettings(new Map());
    expect(parsed.membership.enabled).toBe(false);
    expect(parsed.wallet.enabled).toBe(false);
    expect(parsed.affiliate.enabled).toBe(false);
  });

  it("a corrupt stored value falls back to the default instead of breaking checkout", () => {
    const parsed = parseProgramSettings(new Map([["program.wallet.max_percent", "abc"], ["program.wallet.enabled", "true"]]));
    expect(parsed.wallet.maxPercent).toBe(DEFAULT_PROGRAM_SETTINGS.wallet.maxPercent);
    expect(parsed.wallet.enabled).toBe(true);
  });

  it("partial updates keep the other values and reject out-of-range input", () => {
    const next = mergeProgramSettings(DEFAULT_PROGRAM_SETTINGS, { affiliate: { enabled: true, holdDays: 0 } });
    expect(next.affiliate).toEqual({ enabled: true, attributionDays: 30, holdDays: 0 });
    expect(next.wallet).toEqual(DEFAULT_PROGRAM_SETTINGS.wallet);
    expect(() => mergeProgramSettings(DEFAULT_PROGRAM_SETTINGS, { wallet: { maxPercent: 0 } })).toThrow(ProgramSettingsError);
    expect(() => mergeProgramSettings(DEFAULT_PROGRAM_SETTINGS, { membership: { stackMode: "both" } })).toThrow(ProgramSettingsError);
  });
});
