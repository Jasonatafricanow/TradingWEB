import { beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $client: { execute: mocks.execute } } }));
vi.mock("@/config/constants", () => ({ IS_DEMO_MODE: false }));
import { getUserFromToken, revokeSession, signSessionToken } from "../auth-service";
beforeEach(() => { mocks.execute.mockReset(); });
it("revokes only the token digest and rejects it before reading the user", async () => {
  const token = signSessionToken({ id: "u", email: "u@example.test" }, null);
  mocks.execute.mockResolvedValue([[]]);
  await revokeSession(token);
  expect(mocks.execute.mock.calls[0][1]).toEqual([createHash("sha256").update(token).digest("hex"), expect.any(Date)]);
  expect(JSON.stringify(mocks.execute.mock.calls)).not.toContain(token);
  mocks.execute.mockReset().mockResolvedValue([[{ token_hash: "revoked" }]]);
  expect(await getUserFromToken(token)).toBeNull();
  expect(mocks.execute).toHaveBeenCalledTimes(1);
});
it("issues different tokens for two sessions in the same second", () => {
  const user = { id: "u", email: "u@example.test" };
  expect(signSessionToken(user, null)).not.toBe(signSessionToken(user, null));
});
it("does not write an invalid token and fails closed if revocation cannot be checked", async () => {
  await revokeSession("invalid");
  expect(mocks.execute).not.toHaveBeenCalled();
  mocks.execute.mockRejectedValue(new Error("database unavailable"));
  await expect(getUserFromToken(signSessionToken({ id: "u", email: "u@example.test" }, null))).rejects.toThrow("database unavailable");
});

