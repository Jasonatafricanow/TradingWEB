import { db } from "@/lib/db";
import { logAction } from "@/services/admin/audit-service";
import { readSettings, writeSettings, type SettingsExecutor } from "@/services/admin/site-settings-store";

/**
 * Admin-adjustable switches for membership discount, wallet and affiliate
 * commission. Everything starts OFF so deploying the code changes no price
 * until an admin turns a program on.
 */
export interface ProgramSettings {
  membership: {
    enabled: boolean;
    /** best = the larger of coupon and member discount; stack = both (member on the after-coupon amount). */
    stackMode: "best" | "stack";
  };
  wallet: {
    enabled: boolean;
    /** Share of the order (after discounts, incl. shipping) the wallet may pay, 1–100. */
    maxPercent: number;
    /** Expiry given to money returned to a lot that already expired. */
    restoreGraceDays: number;
  };
  affiliate: {
    enabled: boolean;
    /** Days a referral link stays attributed to the visitor. */
    attributionDays: number;
    /** Days a commission stays pending (refund window) before it reaches the balance. */
    holdDays: number;
  };
}

export const DEFAULT_PROGRAM_SETTINGS: ProgramSettings = {
  membership: { enabled: false, stackMode: "best" },
  wallet: { enabled: false, maxPercent: 100, restoreGraceDays: 30 },
  affiliate: { enabled: false, attributionDays: 30, holdDays: 14 },
};

const KEYS = {
  membershipEnabled: "program.membership.enabled",
  membershipStack: "program.membership.stack_mode",
  walletEnabled: "program.wallet.enabled",
  walletMaxPercent: "program.wallet.max_percent",
  walletGrace: "program.wallet.restore_grace_days",
  affiliateEnabled: "program.affiliate.enabled",
  affiliateAttribution: "program.affiliate.attribution_days",
  affiliateHold: "program.affiliate.hold_days",
} as const;

export class ProgramSettingsError extends Error {
  constructor(public readonly field: string) {
    super(`Invalid program setting: ${field}`);
    this.name = "ProgramSettingsError";
  }
}

function intIn(value: unknown, min: number, max: number, field: string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) throw new ProgramSettingsError(field);
  return n;
}

function bool(value: unknown, field: string): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ProgramSettingsError(field);
}

/** Reads stored values; anything missing or unreadable falls back to the default. */
export function parseProgramSettings(stored: Map<string, string | null>): ProgramSettings {
  const d = DEFAULT_PROGRAM_SETTINGS;
  const read = <T>(key: string, fallback: T, parse: (v: string) => T): T => {
    const raw = stored.get(key);
    if (raw === undefined || raw === null) return fallback;
    try { return parse(raw); } catch { return fallback; }
  };
  return {
    membership: {
      enabled: read(KEYS.membershipEnabled, d.membership.enabled, (v) => bool(v, "membership.enabled")),
      stackMode: read(KEYS.membershipStack, d.membership.stackMode, (v) => {
        if (v !== "best" && v !== "stack") throw new ProgramSettingsError("membership.stackMode");
        return v;
      }),
    },
    wallet: {
      enabled: read(KEYS.walletEnabled, d.wallet.enabled, (v) => bool(v, "wallet.enabled")),
      maxPercent: read(KEYS.walletMaxPercent, d.wallet.maxPercent, (v) => intIn(v, 1, 100, "wallet.maxPercent")),
      restoreGraceDays: read(KEYS.walletGrace, d.wallet.restoreGraceDays, (v) => intIn(v, 1, 3650, "wallet.restoreGraceDays")),
    },
    affiliate: {
      enabled: read(KEYS.affiliateEnabled, d.affiliate.enabled, (v) => bool(v, "affiliate.enabled")),
      attributionDays: read(KEYS.affiliateAttribution, d.affiliate.attributionDays, (v) => intIn(v, 1, 365, "affiliate.attributionDays")),
      holdDays: read(KEYS.affiliateHold, d.affiliate.holdDays, (v) => intIn(v, 0, 365, "affiliate.holdDays")),
    },
  };
}

/** Validates a full or partial update against the current settings. Throws ProgramSettingsError. */
export function mergeProgramSettings(current: ProgramSettings, input: unknown): ProgramSettings {
  if (!input || typeof input !== "object") throw new ProgramSettingsError("body");
  const body = input as Partial<Record<keyof ProgramSettings, Record<string, unknown>>>;
  const next: ProgramSettings = structuredClone(current);
  if (body.membership) {
    if (body.membership.enabled !== undefined) next.membership.enabled = bool(body.membership.enabled, "membership.enabled");
    if (body.membership.stackMode !== undefined) {
      if (body.membership.stackMode !== "best" && body.membership.stackMode !== "stack") throw new ProgramSettingsError("membership.stackMode");
      next.membership.stackMode = body.membership.stackMode;
    }
  }
  if (body.wallet) {
    if (body.wallet.enabled !== undefined) next.wallet.enabled = bool(body.wallet.enabled, "wallet.enabled");
    if (body.wallet.maxPercent !== undefined) next.wallet.maxPercent = intIn(body.wallet.maxPercent, 1, 100, "wallet.maxPercent");
    if (body.wallet.restoreGraceDays !== undefined) next.wallet.restoreGraceDays = intIn(body.wallet.restoreGraceDays, 1, 3650, "wallet.restoreGraceDays");
  }
  if (body.affiliate) {
    if (body.affiliate.enabled !== undefined) next.affiliate.enabled = bool(body.affiliate.enabled, "affiliate.enabled");
    if (body.affiliate.attributionDays !== undefined) next.affiliate.attributionDays = intIn(body.affiliate.attributionDays, 1, 365, "affiliate.attributionDays");
    if (body.affiliate.holdDays !== undefined) next.affiliate.holdDays = intIn(body.affiliate.holdDays, 0, 365, "affiliate.holdDays");
  }
  return next;
}

export async function getProgramSettings(executor: SettingsExecutor = db): Promise<ProgramSettings> {
  return parseProgramSettings(await readSettings("program.", executor));
}

export async function updateProgramSettings(input: unknown, actorId: string | null): Promise<ProgramSettings> {
  return db.transaction(async (tx) => {
    const current = await getProgramSettings(tx);
    const next = mergeProgramSettings(current, input);
    await writeSettings({
      [KEYS.membershipEnabled]: String(next.membership.enabled),
      [KEYS.membershipStack]: next.membership.stackMode,
      [KEYS.walletEnabled]: String(next.wallet.enabled),
      [KEYS.walletMaxPercent]: String(next.wallet.maxPercent),
      [KEYS.walletGrace]: String(next.wallet.restoreGraceDays),
      [KEYS.affiliateEnabled]: String(next.affiliate.enabled),
      [KEYS.affiliateAttribution]: String(next.affiliate.attributionDays),
      [KEYS.affiliateHold]: String(next.affiliate.holdDays),
    }, tx);
    await logAction({
      userId: actorId,
      action: "program_settings.update",
      entityType: "site_settings",
      entityId: "program",
      details: { previous: current, next },
    }, tx);
    return next;
  });
}
