import { beforeEach, describe, expect, it } from "vitest";

import { hashOpaqueToken, hashPosPin } from "../pos-operator-crypto";
import {
  createOperatorSession,
  requirePosOperatorSession,
  revokeOperatorSession,
  type OperatorSessionRecord,
  type OperatorStaffRecord,
  type PosOperatorSessionRepository,
} from "../pos-operator-session-service";

const now = new Date("2026-07-15T08:00:00.000Z");
let staff: OperatorStaffRecord;
let sessions: OperatorSessionRecord[];

function repository(): PosOperatorSessionRepository {
  return {
    findStaff: async (staffId) => staff.id === staffId ? staff : null,
    savePinFailure: async (_staffId, state) => {
      staff = { ...staff, ...state };
    },
    resetPinFailures: async () => {
      staff = {
        ...staff,
        pinFailedAttempts: 0,
        pinLastFailedAt: null,
        pinLockedUntil: null,
      };
    },
    revokeActiveDeviceSessions: async (_staffId, _storeId, deviceId, revokedAt) => {
      sessions = sessions.map((session) => session.deviceId === deviceId && !session.revokedAt
        ? { ...session, revokedAt }
        : session);
    },
    insertSession: async (session) => {
      sessions.push(session);
    },
    findSessionByTokenHash: async (tokenHash) => sessions.find((session) => session.tokenHash === tokenHash) ?? null,
    revokeSessionByTokenHash: async (tokenHash, accountUserId, revokedAt) => {
      const index = sessions.findIndex((session) => session.tokenHash === tokenHash && session.accountUserId === accountUserId && !session.revokedAt);
      if (index < 0) return false;
      sessions[index] = { ...sessions[index], revokedAt };
      return true;
    },
  };
}

beforeEach(() => {
  staff = {
    id: "staff-1",
    storeId: "store-1",
    isActive: true,
    posEnabled: true,
    pinHash: hashPosPin("1234"),
    permissions: ["checkout", "refund"],
    pinFailedAttempts: 0,
    pinLastFailedAt: null,
    pinLockedUntil: null,
  };
  sessions = [];
});

describe("createOperatorSession", () => {
  it("binds a valid session to account, staff, store, and Android installation", async () => {
    const result = await createOperatorSession({
      accountUserId: "user-1",
      staffId: "staff-1",
      storeId: "store-1",
      deviceId: "android-install-1",
      pin: "1234",
    }, repository(), now);

    expect(result.token).toBeTruthy();
    expect(result.operator).toEqual({
      accountUserId: "user-1",
      staffId: "staff-1",
      storeId: "store-1",
      deviceId: "android-install-1",
      permissions: ["checkout", "refund"],
    });
    expect(result.expiresAt).toBe("2026-07-15T16:00:00.000Z");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokenHash).toBe(hashOpaqueToken(result.token));
  });

  it.each([
    [{ isActive: false }, "STAFF_INACTIVE"],
    [{ posEnabled: false }, "POS_DISABLED"],
    [{ storeId: "store-2" }, "STORE_MISMATCH"],
  ])("rejects an ineligible staff record", async (override, code) => {
    staff = { ...staff, ...override };
    await expect(createOperatorSession({
      accountUserId: "user-1",
      staffId: "staff-1",
      storeId: "store-1",
      deviceId: "android-install-1",
      pin: "1234",
    }, repository(), now)).rejects.toMatchObject({ code });
  });

  it("locks only that staff member after five failures within 15 minutes", async () => {
    const repo = repository();
    for (let attempt = 1; attempt <= 4; attempt++) {
      await expect(createOperatorSession({
        accountUserId: "user-1",
        staffId: "staff-1",
        storeId: "store-1",
        deviceId: "android-install-1",
        pin: "9999",
      }, repo, now)).rejects.toMatchObject({ code: "PIN_INVALID" });
    }
    await expect(createOperatorSession({
      accountUserId: "user-1",
      staffId: "staff-1",
      storeId: "store-1",
      deviceId: "android-install-1",
      pin: "9999",
    }, repo, now)).rejects.toMatchObject({ code: "PIN_LOCKED" });
    expect(staff.pinFailedAttempts).toBe(5);
    expect(staff.pinLockedUntil?.toISOString()).toBe("2026-07-15T08:01:00.000Z");
  });
});

describe("require and revoke operator sessions", () => {
  it("requires matching account and Android installation headers", async () => {
    const rawToken = "operator-token";
    sessions.push({
      id: "session-1",
      tokenHash: hashOpaqueToken(rawToken),
      accountUserId: "user-1",
      staffId: "staff-1",
      storeId: "store-1",
      deviceId: "android-install-1",
      permissions: ["checkout"],
      expiresAt: new Date("2026-07-15T16:00:00.000Z"),
      revokedAt: null,
      createdAt: now,
    });
    const request = new Request("https://example.test", { headers: {
      "X-POS-Operator-Session": rawToken,
      "X-POS-Device-ID": "android-install-1",
    } });

    await expect(requirePosOperatorSession(request, "user-1", repository(), now)).resolves.toMatchObject({ staffId: "staff-1" });
    await expect(requirePosOperatorSession(request, "user-2", repository(), now)).rejects.toMatchObject({ code: "OPERATOR_ACCOUNT_MISMATCH" });
  });

  it("rejects expired and revoked sessions", async () => {
    const rawToken = "operator-token";
    sessions.push({
      id: "session-1",
      tokenHash: hashOpaqueToken(rawToken),
      accountUserId: "user-1",
      staffId: "staff-1",
      storeId: "store-1",
      deviceId: "android-install-1",
      permissions: [],
      expiresAt: new Date("2026-07-15T07:59:59.000Z"),
      revokedAt: null,
      createdAt: now,
    });
    const request = new Request("https://example.test", { headers: {
      "X-POS-Operator-Session": rawToken,
      "X-POS-Device-ID": "android-install-1",
    } });
    await expect(requirePosOperatorSession(request, "user-1", repository(), now)).rejects.toMatchObject({ code: "OPERATOR_SESSION_EXPIRED" });
  });

  it("revokes only a session owned by the authenticated account", async () => {
    const rawToken = "operator-token";
    sessions.push({
      id: "session-1",
      tokenHash: hashOpaqueToken(rawToken),
      accountUserId: "user-1",
      staffId: "staff-1",
      storeId: "store-1",
      deviceId: "android-install-1",
      permissions: [],
      expiresAt: new Date("2026-07-15T16:00:00.000Z"),
      revokedAt: null,
      createdAt: now,
    });
    await expect(revokeOperatorSession(rawToken, "user-2", repository(), now)).resolves.toBe(false);
    await expect(revokeOperatorSession(rawToken, "user-1", repository(), now)).resolves.toBe(true);
  });
});
