import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
const mocks = vi.hoisted(() => ({ rows: [] as unknown[][], insert: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { transaction: async (work: (tx: unknown) => unknown) => work({
  select: () => ({ from: () => ({ where: () => ({ limit: async () => mocks.rows.shift() || [] }) }) }),
  insert: () => ({ values: mocks.insert }),
}) } }));
import { findOrCreateUser, verifyAppleToken } from "@/lib/oauth";
const user = { id: "user-1", email: "old@example.com", name: "Old", password_hash: "hash", is_active: true };
beforeEach(() => { mocks.rows = []; mocks.insert.mockReset(); });
describe("OAuth subject binding", () => {
  it("rejects an email match without authenticated linking, even for passwordless legacy users", async () => {
    for (const password_hash of ["hash", null]) {
      mocks.rows = [[], [{ ...user, password_hash }]];
      await expect(findOrCreateUser(user.email, "Name", { provider: "google", subject: "new" })).rejects.toThrow("explicitly link");
    }
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("returns the bound account despite a changed provider email", async () => {
    mocks.rows = [[{ user_id: user.id }], [user]];
    await expect(findOrCreateUser("changed@example.com", "Name", { provider: "google", subject: "bound" })).resolves.toMatchObject({ id: user.id, email: user.email, isNew: false });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("explicitly binds the authenticated account", async () => {
    mocks.rows = [[], [user]];
    await findOrCreateUser(user.email, "Name", { provider: "google", subject: "new" }, user.id);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: user.id, provider: "google", subject: "new" }));
  });
  it("rejects binding an identity owned by somebody else", async () => {
    mocks.rows = [[{ user_id: "other" }]];
    await expect(findOrCreateUser(user.email, "Name", { provider: "google", subject: "bound" }, user.id)).rejects.toThrow("another account");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("creates both account and subject binding for a new user", async () => {
    mocks.rows = [[], []];
    const result = await findOrCreateUser("new@example.com", "New", { provider: "google", subject: "new" });
    expect(mocks.insert).toHaveBeenCalledTimes(2);
    expect(mocks.insert).toHaveBeenLastCalledWith(expect.objectContaining({ user_id: result.id, subject: "new" }));
  });
});
describe("Apple signature verification", () => {
  it("accepts only signed, unexpired identities with verified email", async () => {
    process.env.APPLE_CLIENT_ID = "apple-client";
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "key-1" }] }) }));
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const token = (claims: object) => {
      const data = `${encode({ alg: "RS256", kid: "key-1" })}.${encode(claims)}`;
      return `${data}.${sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url")}`;
    };
    const claims = { iss: "https://appleid.apple.com", aud: "apple-client", exp: Math.floor(Date.now()/1000)+300, sub: "apple-sub", email: "a@example.com", email_verified: "true" };
    try {
      await expect(verifyAppleToken(token(claims))).resolves.toMatchObject({ appleId: "apple-sub" });
      await expect(verifyAppleToken(token({ ...claims, exp: 1 }))).rejects.toThrow("claims");
      await expect(verifyAppleToken(token({ ...claims, email_verified: false }))).rejects.toThrow("claims");
      const parts = token(claims).split("."); parts[1] = encode({ ...claims, sub: "forged" });
      await expect(verifyAppleToken(parts.join("."))).rejects.toThrow("signature");
    } finally { vi.unstubAllGlobals(); }
  });
});
