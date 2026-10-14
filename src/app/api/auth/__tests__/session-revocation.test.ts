import { describe, expect, it, vi } from "vitest"

import { hashPassword, passwordResetVersion, verifyToken } from "@/lib/auth-local"
import {
  resolveAuthenticatedUser,
  signSessionToken,
  type AuthRepository,
} from "@/services/auth/auth-service"

function repoWithHash(passwordHash: string | null): AuthRepository {
  return {
    findUserById: vi.fn(async () => ({
      id: "user-1",
      email: "buyer@example.test",
      name: null,
      is_active: true,
      password_hash: passwordHash,
    })),
    findStaffByUserId: vi.fn(async () => null),
  }
}

describe("session tokens are bound to the credential version", () => {
  const oldHash = hashPassword("old-password")
  const newHash = hashPassword("new-password")

  it("accepts a session issued under the current password", async () => {
    const payload = verifyToken(signSessionToken({ id: "user-1", email: "buyer@example.test" }, oldHash))!
    await expect(resolveAuthenticatedUser(payload, repoWithHash(oldHash))).resolves.toMatchObject({ id: "user-1" })
  })

  it("ends older sessions after a password change", async () => {
    const payload = verifyToken(signSessionToken({ id: "user-1", email: "buyer@example.test" }, oldHash))!
    await expect(resolveAuthenticatedUser(payload, repoWithHash(newHash))).resolves.toBeNull()
  })

  it("does not accept a password-reset link as a session", async () => {
    const payload = {
      sub: "user-1",
      email: "buyer@example.test",
      role: "password_reset",
      pwdv: passwordResetVersion(oldHash),
      iat: 1,
      exp: 9999999999,
    }
    await expect(resolveAuthenticatedUser(payload, repoWithHash(oldHash))).resolves.toBeNull()
  })

  it("keeps pre-existing tokens without pwdv valid until they expire", async () => {
    const payload = { sub: "user-1", email: "buyer@example.test", iat: 1, exp: 9999999999 }
    await expect(resolveAuthenticatedUser(payload, repoWithHash(newHash))).resolves.toMatchObject({ id: "user-1" })
  })
})
