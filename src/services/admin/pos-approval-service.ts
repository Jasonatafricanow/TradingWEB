import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { posApprovalTokens, staff } from "@/storage/database/shared/schema";
import type { DbTx } from "@/services/orders/order-pricing-service";
import { hashOpaqueToken, issueOpaqueToken } from "./pos-operator-crypto";

const APPROVAL_TTL_MS = 5 * 60 * 1000;

export interface ApprovalTokenRecord {
  id: string;
  tokenHash: string;
  operation: string;
  resourceHash: string;
  approvedBy: string;
  storeId: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface ApprovalApproverRecord {
  id: string;
  role: string;
  storeId: string | null;
  isActive: boolean;
}

export interface PosApprovalRepository {
  findApprover(staffId: string): Promise<ApprovalApproverRecord | null>;
  insertToken(token: ApprovalTokenRecord): Promise<void>;
  consumeToken(
    tokenHash: string,
    operation: string,
    resourceHash: string,
    storeId: string,
    consumedAt: Date,
    tx: DbTx,
  ): Promise<string | null>;
}

export class PosApprovalError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
    this.name = "PosApprovalError";
  }
}

const databaseRepository: PosApprovalRepository = {
  async findApprover(staffId) {
    const [row] = await db.select({
      id: staff.id,
      role: staff.role,
      storeId: staff.store_id,
      isActive: staff.is_active,
    }).from(staff).where(eq(staff.id, staffId)).limit(1);
    return row ?? null;
  },
  async insertToken(token) {
    await db.insert(posApprovalTokens).values({
      id: token.id,
      token_hash: token.tokenHash,
      operation: token.operation,
      resource_hash: token.resourceHash,
      approved_by: token.approvedBy,
      store_id: token.storeId,
      expires_at: token.expiresAt,
      consumed_at: token.consumedAt,
      created_at: token.createdAt,
    });
  },
  async consumeToken(tokenHash, operation, resourceHash, storeId, consumedAt, tx) {
    const result = await tx.update(posApprovalTokens).set({ consumed_at: consumedAt }).where(and(
      eq(posApprovalTokens.token_hash, tokenHash),
      eq(posApprovalTokens.operation, operation),
      eq(posApprovalTokens.resource_hash, resourceHash),
      eq(posApprovalTokens.store_id, storeId),
      isNull(posApprovalTokens.consumed_at),
      gt(posApprovalTokens.expires_at, consumedAt),
    ));
    const affectedRows = ((result as unknown as [{ affectedRows: number }])[0]?.affectedRows ?? 0);
    if (affectedRows !== 1) return null;
    const [row] = await tx.select({ approvedBy: posApprovalTokens.approved_by })
      .from(posApprovalTokens).where(eq(posApprovalTokens.token_hash, tokenHash)).limit(1);
    return row?.approvedBy ?? null;
  },
};

export async function issueApprovalToken(
  input: {
    approvedByStaffId: string;
    storeId: string;
    operation: string;
    resourceHash: string;
  },
  repository: PosApprovalRepository = databaseRepository,
  now: Date = new Date(),
): Promise<{ token: string; expiresAt: string }> {
  const operation = input.operation.trim();
  if (!operation || operation.length > 40) throw new PosApprovalError("APPROVAL_OPERATION_INVALID", 400);
  if (!/^[a-f0-9]{64}$/i.test(input.resourceHash)) throw new PosApprovalError("APPROVAL_RESOURCE_HASH_INVALID", 400);
  const approver = await repository.findApprover(input.approvedByStaffId);
  if (!approver) throw new PosApprovalError("APPROVER_NOT_FOUND", 404);
  if (!approver.isActive) throw new PosApprovalError("APPROVER_INACTIVE", 403);
  if (!(["admin", "manager"] as string[]).includes(approver.role)) {
    throw new PosApprovalError("APPROVER_ROLE_REQUIRED", 403);
  }
  if (approver.storeId !== input.storeId) throw new PosApprovalError("APPROVER_STORE_MISMATCH", 403);

  const token = issueOpaqueToken();
  const expiresAt = new Date(now.getTime() + APPROVAL_TTL_MS);
  await repository.insertToken({
    id: randomUUID(),
    tokenHash: hashOpaqueToken(token),
    operation,
    resourceHash: input.resourceHash.toLowerCase(),
    approvedBy: approver.id,
    storeId: input.storeId,
    expiresAt,
    consumedAt: null,
    createdAt: now,
  });
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function consumeApprovalToken(
  token: string,
  operation: string,
  resourceHash: string,
  storeId: string,
  tx: DbTx,
  repository: PosApprovalRepository = databaseRepository,
  now: Date = new Date(),
): Promise<string> {
  const approvedBy = await repository.consumeToken(
    hashOpaqueToken(token),
    operation,
    resourceHash.toLowerCase(),
    storeId,
    now,
    tx,
  );
  if (!approvedBy) throw new PosApprovalError("APPROVAL_INVALID_OR_CONSUMED", 409);
  return approvedBy;
}
