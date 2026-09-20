import { describe, expect, it, vi } from "vitest";

import { verifyPosPin } from "../pos-operator-crypto";
import {
  applyStaffUpdate,
  toPublicStaff,
  type StaffUpdateRepository,
} from "../staff-service";

describe("toPublicStaff", () => {
  it("never exposes POS PIN hashes or lockout internals", () => {
    const result = toPublicStaff({
      id: "staff-1",
      name: "Ada",
      email: "ada@example.test",
      role: "operator",
      pos_enabled: true,
      pos_permissions: ["checkout"],
      pos_pin_hash: "pbkdf2_sha256$secret",
      pos_pin: "1234",
      pos_pin_failed_attempts: 4,
      pos_pin_last_failed_at: new Date(),
      pos_pin_locked_until: new Date(),
    });
    expect(result).toMatchObject({
      id: "staff-1",
      pos_enabled: true,
      pos_permissions: ["checkout"],
      pos_pin_configured: true,
    });
    expect(result).not.toHaveProperty("pos_pin_hash");
    expect(result).not.toHaveProperty("pos_pin");
    expect(result).not.toHaveProperty("pos_pin_failed_attempts");
    expect(result).not.toHaveProperty("pos_pin_last_failed_at");
    expect(result).not.toHaveProperty("pos_pin_locked_until");
  });
});

function repository() {
  let record: Record<string, unknown> = {
    id: "staff-1",
    name: "Ada",
    email: "ada@example.test",
    role: "operator",
    store_id: "store-1",
    is_active: true,
    pos_enabled: true,
    pos_permissions: ["checkout"],
    pos_pin_hash: null,
    pos_pin_failed_attempts: 4,
    pos_pin_last_failed_at: new Date("2026-07-18T08:00:00.000Z"),
    pos_pin_locked_until: new Date("2026-07-18T08:01:00.000Z"),
  };
  const revokeActiveSessions = vi.fn(async () => undefined);
  const repo: StaffUpdateRepository = {
    findSecuritySnapshot: async () => record as never,
    update: async (_id, values) => {
      record = { ...record, ...values };
      return record;
    },
    revokeActiveSessions,
  };
  return { repo, revokeActiveSessions, getRecord: () => record };
}

describe("applyStaffUpdate", () => {
  it("stores a new PIN hash, clears lockout state, revokes sessions, and redacts the response", async () => {
    const state = repository();
    const now = new Date("2026-07-18T09:00:00.000Z");

    const result = await applyStaffUpdate("staff-1", { pos_pin: "5678" }, state.repo, now);
    const updated = state.getRecord();

    expect(verifyPosPin("5678", String(updated.pos_pin_hash))).toBe(true);
    expect(updated).toMatchObject({
      pos_pin_failed_attempts: 0,
      pos_pin_last_failed_at: null,
      pos_pin_locked_until: null,
    });
    expect(state.revokeActiveSessions).toHaveBeenCalledWith("staff-1", now);
    expect(result.pos_pin_configured).toBe(true);
    expect(result).not.toHaveProperty("pos_pin_hash");
  });

  it("does not revoke sessions when submitted POS configuration is unchanged", async () => {
    const state = repository();

    await applyStaffUpdate("staff-1", {
      store_id: "store-1",
      is_active: true,
      pos_enabled: true,
      pos_permissions: ["checkout"],
    }, state.repo);

    expect(state.revokeActiveSessions).not.toHaveBeenCalled();
  });
});
