import { describe, expect, it, vi } from "vitest";

import { planStaffPosUpdate, type StaffPosSnapshot } from "../staff-pos-policy";

const current: StaffPosSnapshot = {
  store_id: "store-1",
  is_active: true,
  pos_enabled: true,
  pos_permissions: ["checkout"],
};

describe("planStaffPosUpdate", () => {
  it("hashes a new PIN, clears lockout state, and revokes active sessions", () => {
    const hash = vi.fn((pin: string) => `hash:${pin}`);

    expect(planStaffPosUpdate(current, { pos_pin: "5678" }, hash)).toEqual({
      values: {
        pos_pin_hash: "hash:5678",
        pos_pin_failed_attempts: 0,
        pos_pin_last_failed_at: null,
        pos_pin_locked_until: null,
      },
      revokeSessions: true,
    });
    expect(hash).toHaveBeenCalledWith("5678");
  });

  it("does not revoke when POS configuration values are unchanged", () => {
    expect(planStaffPosUpdate(current, {
      store_id: "store-1",
      is_active: true,
      pos_enabled: true,
      pos_permissions: ["checkout"],
    }, vi.fn())).toEqual({ values: {}, revokeSessions: false });
  });

  it.each([
    [{ store_id: "store-2" }],
    [{ store_id: null }],
    [{ pos_enabled: false }],
    [{ is_active: false }],
    [{ pos_permissions: [] }],
  ])("revokes active sessions after a security-sensitive change %#", (input) => {
    expect(planStaffPosUpdate(current, input, vi.fn()).revokeSessions).toBe(true);
  });
});
