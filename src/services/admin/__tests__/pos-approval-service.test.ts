import { beforeEach, describe, expect, it } from "vitest";

import {
  consumeApprovalToken,
  issueApprovalToken,
  type ApprovalTokenRecord,
  type PosApprovalRepository,
} from "../pos-approval-service";
import { hashOpaqueToken } from "../pos-operator-crypto";

const now = new Date("2026-07-15T09:00:00.000Z");
let tokens: ApprovalTokenRecord[];

function repository(role = "manager", storeId = "store-1", active = true): PosApprovalRepository {
  return {
    findApprover: async () => ({ id: "manager-1", role, storeId, isActive: active }),
    insertToken: async (token) => { tokens.push(token); },
    consumeToken: async (tokenHash, operation, resourceHash, requestedStoreId, consumedAt) => {
      const token = tokens.find((entry) => entry.tokenHash === tokenHash
        && entry.operation === operation
        && entry.resourceHash === resourceHash
        && entry.storeId === requestedStoreId
        && !entry.consumedAt
        && entry.expiresAt > consumedAt);
      if (!token) return null;
      token.consumedAt = consumedAt;
      return token.approvedBy;
    },
  };
}

beforeEach(() => { tokens = []; });

describe("issueApprovalToken", () => {
  it("issues a five-minute operation/resource/store-scoped token", async () => {
    const result = await issueApprovalToken({
      approvedByStaffId: "manager-1",
      storeId: "store-1",
      operation: "refund",
      resourceHash: "a".repeat(64),
    }, repository(), now);
    expect(result.expiresAt).toBe("2026-07-15T09:05:00.000Z");
    expect(tokens[0]).toMatchObject({
      tokenHash: hashOpaqueToken(result.token),
      operation: "refund",
      resourceHash: "a".repeat(64),
      approvedBy: "manager-1",
      storeId: "store-1",
    });
  });

  it.each([
    ["operator", "store-1", true, "APPROVER_ROLE_REQUIRED"],
    ["manager", "store-2", true, "APPROVER_STORE_MISMATCH"],
    ["manager", "store-1", false, "APPROVER_INACTIVE"],
  ])("rejects an ineligible approver", async (role, approverStore, active, code) => {
    await expect(issueApprovalToken({
      approvedByStaffId: "manager-1",
      storeId: "store-1",
      operation: "refund",
      resourceHash: "a".repeat(64),
    }, repository(role, approverStore, active), now)).rejects.toMatchObject({ code });
  });
});

describe("consumeApprovalToken", () => {
  it("consumes a matching token exactly once", async () => {
    const repo = repository();
    const issued = await issueApprovalToken({
      approvedByStaffId: "manager-1",
      storeId: "store-1",
      operation: "refund",
      resourceHash: "a".repeat(64),
    }, repo, now);
    await expect(consumeApprovalToken(issued.token, "refund", "a".repeat(64), "store-1", {} as never, repo, now))
      .resolves.toBe("manager-1");
    await expect(consumeApprovalToken(issued.token, "refund", "a".repeat(64), "store-1", {} as never, repo, now))
      .rejects.toMatchObject({ code: "APPROVAL_INVALID_OR_CONSUMED" });
  });

  it("rejects operation, resource, store, and expiry mismatches", async () => {
    const repo = repository();
    const issued = await issueApprovalToken({
      approvedByStaffId: "manager-1",
      storeId: "store-1",
      operation: "refund",
      resourceHash: "a".repeat(64),
    }, repo, now);
    await expect(consumeApprovalToken(issued.token, "exchange", "a".repeat(64), "store-1", {} as never, repo, now))
      .rejects.toMatchObject({ code: "APPROVAL_INVALID_OR_CONSUMED" });
    await expect(consumeApprovalToken(issued.token, "refund", "b".repeat(64), "store-1", {} as never, repo, now))
      .rejects.toMatchObject({ code: "APPROVAL_INVALID_OR_CONSUMED" });
    await expect(consumeApprovalToken(issued.token, "refund", "a".repeat(64), "store-2", {} as never, repo, now))
      .rejects.toMatchObject({ code: "APPROVAL_INVALID_OR_CONSUMED" });
    await expect(consumeApprovalToken(issued.token, "refund", "a".repeat(64), "store-1", {} as never, repo, new Date("2026-07-15T09:06:00.000Z")))
      .rejects.toMatchObject({ code: "APPROVAL_INVALID_OR_CONSUMED" });
  });
});
