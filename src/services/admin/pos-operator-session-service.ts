import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { posOperatorSessions, staff } from "@/storage/database/shared/schema";
import { hashOpaqueToken, issueOpaqueToken, verifyPosPin } from "./pos-operator-crypto";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const PIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const PIN_LOCK_MS = 60 * 1000;
const PIN_MAX_FAILURES = 5;

export interface PosOperatorContext {
  accountUserId: string;
  staffId: string;
  storeId: string;
  deviceId: string;
  permissions: string[];
}

export interface OperatorStaffRecord {
  id: string;
  storeId: string | null;
  isActive: boolean;
  posEnabled: boolean;
  pinHash: string | null;
  permissions: string[];
  pinFailedAttempts: number;
  pinLastFailedAt: Date | null;
  pinLockedUntil: Date | null;
}

export interface OperatorSessionRecord {
  id: string;
  tokenHash: string;
  accountUserId: string;
  staffId: string;
  storeId: string;
  deviceId: string;
  permissions: string[];
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface PinFailureState {
  pinFailedAttempts: number;
  pinLastFailedAt: Date;
  pinLockedUntil: Date | null;
}

export interface PosOperatorSessionRepository {
  findStaff(staffId: string): Promise<OperatorStaffRecord | null>;
  savePinFailure(staffId: string, state: PinFailureState): Promise<void>;
  resetPinFailures(staffId: string): Promise<void>;
  revokeActiveDeviceSessions(staffId: string, storeId: string, deviceId: string, revokedAt: Date): Promise<void>;
  insertSession(session: OperatorSessionRecord): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<OperatorSessionRecord | null>;
  revokeSessionByTokenHash(tokenHash: string, accountUserId: string, revokedAt: Date): Promise<boolean>;
}

export class PosOperatorSessionError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "PosOperatorSessionError";
  }
}

function permissions(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

const databaseRepository: PosOperatorSessionRepository = {
  async findStaff(staffId) {
    const [row] = await db.select({
      id: staff.id,
      storeId: staff.store_id,
      isActive: staff.is_active,
      posEnabled: staff.pos_enabled,
      pinHash: staff.pos_pin_hash,
      permissions: staff.pos_permissions,
      pinFailedAttempts: staff.pos_pin_failed_attempts,
      pinLastFailedAt: staff.pos_pin_last_failed_at,
      pinLockedUntil: staff.pos_pin_locked_until,
    }).from(staff).where(eq(staff.id, staffId)).limit(1);
    return row ? { ...row, permissions: permissions(row.permissions) } : null;
  },
  async savePinFailure(staffId, state) {
    await db.update(staff).set({
      pos_pin_failed_attempts: state.pinFailedAttempts,
      pos_pin_last_failed_at: state.pinLastFailedAt,
      pos_pin_locked_until: state.pinLockedUntil,
    }).where(eq(staff.id, staffId));
  },
  async resetPinFailures(staffId) {
    await db.update(staff).set({
      pos_pin_failed_attempts: 0,
      pos_pin_last_failed_at: null,
      pos_pin_locked_until: null,
    }).where(eq(staff.id, staffId));
  },
  async revokeActiveDeviceSessions(staffId, storeId, deviceId, revokedAt) {
    await db.update(posOperatorSessions).set({ revoked_at: revokedAt }).where(and(
      eq(posOperatorSessions.staff_id, staffId),
      eq(posOperatorSessions.store_id, storeId),
      eq(posOperatorSessions.device_id, deviceId),
      isNull(posOperatorSessions.revoked_at),
    ));
  },
  async insertSession(session) {
    await db.insert(posOperatorSessions).values({
      id: session.id,
      token_hash: session.tokenHash,
      account_user_id: session.accountUserId,
      staff_id: session.staffId,
      store_id: session.storeId,
      device_id: session.deviceId,
      permissions: session.permissions,
      expires_at: session.expiresAt,
      revoked_at: session.revokedAt,
      created_at: session.createdAt,
    });
  },
  async findSessionByTokenHash(tokenHash) {
    const [row] = await db.select().from(posOperatorSessions)
      .where(eq(posOperatorSessions.token_hash, tokenHash)).limit(1);
    return row ? {
      id: row.id,
      tokenHash: row.token_hash,
      accountUserId: row.account_user_id,
      staffId: row.staff_id,
      storeId: row.store_id,
      deviceId: row.device_id,
      permissions: permissions(row.permissions),
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
    } : null;
  },
  async revokeSessionByTokenHash(tokenHash, accountUserId, revokedAt) {
    const result = await db.update(posOperatorSessions).set({ revoked_at: revokedAt }).where(and(
      eq(posOperatorSessions.token_hash, tokenHash),
      eq(posOperatorSessions.account_user_id, accountUserId),
      isNull(posOperatorSessions.revoked_at),
    ));
    return ((result as unknown as [{ affectedRows: number }])[0]?.affectedRows ?? 0) > 0;
  },
};

export async function createOperatorSession(
  input: {
    accountUserId: string;
    staffId: string;
    storeId: string;
    deviceId: string;
    pin: string;
  },
  repository: PosOperatorSessionRepository = databaseRepository,
  now: Date = new Date(),
): Promise<{ token: string; operator: PosOperatorContext; expiresAt: string }> {
  const deviceId = input.deviceId.trim();
  if (!deviceId || deviceId.length > 100) throw new PosOperatorSessionError("DEVICE_ID_INVALID", 400);
  const member = await repository.findStaff(input.staffId);
  if (!member) throw new PosOperatorSessionError("STAFF_NOT_FOUND", 404);
  if (!member.isActive) throw new PosOperatorSessionError("STAFF_INACTIVE", 403);
  if (!member.posEnabled) throw new PosOperatorSessionError("POS_DISABLED", 403);
  if (member.storeId !== input.storeId) throw new PosOperatorSessionError("STORE_MISMATCH", 403);
  if (!member.pinHash) throw new PosOperatorSessionError("PIN_NOT_CONFIGURED", 403);
  if (member.pinLockedUntil && member.pinLockedUntil.getTime() > now.getTime()) {
    throw new PosOperatorSessionError("PIN_LOCKED", 429);
  }

  if (!verifyPosPin(input.pin, member.pinHash)) {
    const withinWindow = member.pinLastFailedAt
      && now.getTime() - member.pinLastFailedAt.getTime() <= PIN_FAILURE_WINDOW_MS;
    const attempts = (withinWindow ? member.pinFailedAttempts : 0) + 1;
    const lockedUntil = attempts >= PIN_MAX_FAILURES
      ? new Date(now.getTime() + PIN_LOCK_MS)
      : null;
    await repository.savePinFailure(member.id, {
      pinFailedAttempts: attempts,
      pinLastFailedAt: now,
      pinLockedUntil: lockedUntil,
    });
    throw new PosOperatorSessionError(lockedUntil ? "PIN_LOCKED" : "PIN_INVALID", lockedUntil ? 429 : 403);
  }

  await repository.resetPinFailures(member.id);
  await repository.revokeActiveDeviceSessions(member.id, input.storeId, deviceId, now);
  const token = issueOpaqueToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const session: OperatorSessionRecord = {
    id: randomUUID(),
    tokenHash: hashOpaqueToken(token),
    accountUserId: input.accountUserId,
    staffId: member.id,
    storeId: input.storeId,
    deviceId,
    permissions: member.permissions,
    expiresAt,
    revokedAt: null,
    createdAt: now,
  };
  await repository.insertSession(session);
  return {
    token,
    operator: {
      accountUserId: input.accountUserId,
      staffId: member.id,
      storeId: input.storeId,
      deviceId,
      permissions: member.permissions,
    },
    expiresAt: expiresAt.toISOString(),
  };
}

export async function requirePosOperatorSession(
  request: Request,
  accountUserId: string,
  repository: PosOperatorSessionRepository = databaseRepository,
  now: Date = new Date(),
): Promise<PosOperatorContext> {
  const token = request.headers.get("X-POS-Operator-Session")?.trim();
  const deviceId = request.headers.get("X-POS-Device-ID")?.trim();
  if (!token) throw new PosOperatorSessionError("OPERATOR_SESSION_REQUIRED", 401);
  if (!deviceId) throw new PosOperatorSessionError("DEVICE_ID_REQUIRED", 400);
  const session = await repository.findSessionByTokenHash(hashOpaqueToken(token));
  if (!session || session.revokedAt) throw new PosOperatorSessionError("OPERATOR_SESSION_INVALID", 401);
  if (session.expiresAt.getTime() <= now.getTime()) throw new PosOperatorSessionError("OPERATOR_SESSION_EXPIRED", 401);
  if (session.accountUserId !== accountUserId) throw new PosOperatorSessionError("OPERATOR_ACCOUNT_MISMATCH", 403);
  if (session.deviceId !== deviceId) throw new PosOperatorSessionError("OPERATOR_DEVICE_MISMATCH", 403);
  return {
    accountUserId: session.accountUserId,
    staffId: session.staffId,
    storeId: session.storeId,
    deviceId: session.deviceId,
    permissions: session.permissions,
  };
}

export async function revokeOperatorSession(
  token: string,
  accountUserId: string,
  repository: PosOperatorSessionRepository = databaseRepository,
  now: Date = new Date(),
): Promise<boolean> {
  return repository.revokeSessionByTokenHash(hashOpaqueToken(token), accountUserId, now);
}
