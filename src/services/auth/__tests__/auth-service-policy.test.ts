import { describe, expect, it, vi } from "vitest";

import {
  resolveAuthenticatedUser,
  type AuthRepository,
} from "../auth-service";
import type { JwtPayload } from "@/lib/auth-local";

const payload: JwtPayload = {
  sub: "user-1",
  email: "attacker@example.test",
  iat: 1,
  exp: 9999999999,
};

function repository(overrides: Partial<AuthRepository> = {}): AuthRepository {
  return {
    findUserById: vi.fn(async () => ({
      id: "user-1",
      email: "real@example.test",
      name: "Real User",
      is_active: true,
    })),
    findStaffByUserId: vi.fn(async () => null),
    ...overrides,
  };
}

describe("resolveAuthenticatedUser", () => {
  it("rejects a disabled user even when the JWT is otherwise valid", async () => {
    const repo = repository({
      findUserById: vi.fn(async () => ({
        id: "user-1",
        email: "real@example.test",
        name: "Real User",
        is_active: false,
      })),
    });

    await expect(resolveAuthenticatedUser(payload, repo)).resolves.toBeNull();
    expect(repo.findStaffByUserId).not.toHaveBeenCalled();
  });

  it("grants staff role only from an active staff row bound to the user id", async () => {
    const repo = repository({
      findStaffByUserId: vi.fn(async (userId) => {
        expect(userId).toBe("user-1");
        return { id: "staff-1", role: "admin", is_active: true };
      }),
    });

    await expect(resolveAuthenticatedUser(payload, repo)).resolves.toEqual({
      id: "user-1",
      email: "real@example.test",
      name: "Real User",
      role: "admin",
      staffId: "staff-1",
    });
  });

  it("does not grant privileges from an inactive staff row", async () => {
    const repo = repository({
      findStaffByUserId: vi.fn(async () => ({
        id: "staff-1",
        role: "admin",
        is_active: false,
      })),
    });

    await expect(resolveAuthenticatedUser(payload, repo)).resolves.toEqual({
      id: "user-1",
      email: "real@example.test",
      name: "Real User",
      role: undefined,
      staffId: undefined,
    });
  });

  it("uses database identity rather than the email claim in the token", async () => {
    const repo = repository();
    const result = await resolveAuthenticatedUser(payload, repo);

    expect(result?.email).toBe("real@example.test");
    expect(repo.findStaffByUserId).toHaveBeenCalledWith("user-1");
  });
});
