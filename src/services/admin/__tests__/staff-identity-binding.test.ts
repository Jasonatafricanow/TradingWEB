import { describe, expect, it, vi } from "vitest";

import { resolveExplicitStaffUserId } from "../staff-service";

function fakeDatabase(rows: unknown[]) {
  const execute = vi.fn(async () => [rows]);
  return {
    database: { $client: { execute } } as never,
    execute,
  };
}

const baseInput = {
  name: "Ada",
  email: "ada@example.test",
  role: "admin",
};

describe("resolveExplicitStaffUserId", () => {
  it("leaves a staff record unbound when user_id is not explicitly supplied", async () => {
    const { database, execute } = fakeDatabase([
      { id: "attacker", email: "ada@example.test", is_active: true },
    ]);

    await expect(resolveExplicitStaffUserId(database, baseInput)).resolves.toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it("binds an explicitly supplied active user with the same email", async () => {
    const { database } = fakeDatabase([
      { id: "user-1", email: "ada@example.test", is_active: true },
    ]);

    await expect(resolveExplicitStaffUserId(database, {
      ...baseInput,
      user_id: "user-1",
    })).resolves.toBe("user-1");
  });

  it("rejects an explicit binding when the user email does not match", async () => {
    const { database } = fakeDatabase([
      { id: "user-1", email: "other@example.test", is_active: true },
    ]);

    await expect(resolveExplicitStaffUserId(database, {
      ...baseInput,
      user_id: "user-1",
    })).rejects.toThrow("员工邮箱必须与绑定用户邮箱一致");
  });

  it("rejects binding a disabled user", async () => {
    const { database } = fakeDatabase([
      { id: "user-1", email: "ada@example.test", is_active: false },
    ]);

    await expect(resolveExplicitStaffUserId(database, {
      ...baseInput,
      user_id: "user-1",
    })).rejects.toThrow("绑定用户已禁用");
  });
});
