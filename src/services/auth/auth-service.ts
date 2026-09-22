/**
 * 本地认证服务 — 使用 JWT + 数据库
 */
import { signToken, verifyToken, type JwtPayload } from "@/lib/auth-local"
import { IS_DEMO_MODE } from "@/config/constants"

export interface AuthenticatedUser {
  id: string
  email: string
  name?: string | null
  role?: string
  staffId?: string
}

export interface AuthUserRecord {
  id: string
  email: string
  name: string | null
  is_active: boolean | number
}

export interface AuthStaffRecord {
  id: string
  role: string
  is_active: boolean | number
}

export interface AuthRepository {
  findUserById(userId: string): Promise<AuthUserRecord | null>
  findStaffByUserId(userId: string): Promise<AuthStaffRecord | null>
}

/**
 * Resolve a verified JWT subject against current database state.
 *
 * Staff authorization is identity-bound: only staff.user_id may grant a role.
 * Email is descriptive data and is never an authorization fallback.
 */
export async function resolveAuthenticatedUser(
  payload: JwtPayload,
  repository: AuthRepository,
): Promise<AuthenticatedUser | null> {
  const user = await repository.findUserById(payload.sub)
  if (!user || !Boolean(user.is_active)) return null

  let role: string | undefined
  let staffId: string | undefined
  const staff = await repository.findStaffByUserId(user.id)
  if (staff && Boolean(staff.is_active)) {
    role = staff.role
    staffId = staff.id
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role,
    staffId,
  }
}

/**
 * 从 Authorization header 解析 JWT 并返回当前仍有效的用户。
 */
export async function getUserFromToken(token: string): Promise<AuthenticatedUser | null> {
  const payload = verifyToken(token)
  if (!payload) return null

  // ═══════ DEMO MODE ═══════
  if (IS_DEMO_MODE) {
    return {
      id: payload.sub,
      email: payload.email,
      name: null,
      role: payload.sub === "demo-admin-001" ? "admin" : undefined,
    }
  }

  // ═══════ PRODUCTION MODE ═══════
  const { db } = await import("@/lib/db")

  const repository: AuthRepository = {
    async findUserById(userId) {
      const [rows] = await db.$client.execute(
        "SELECT id, email, name, is_active FROM users WHERE id = ? LIMIT 1",
        [userId],
      )
      return (rows as AuthUserRecord[])[0] ?? null
    },
    async findStaffByUserId(userId) {
      try {
        const [rows] = await db.$client.execute(
          "SELECT id, role, is_active FROM staff WHERE user_id = ? LIMIT 1",
          [userId],
        )
        return (rows as AuthStaffRecord[])[0] ?? null
      } catch {
        // Older deployments may not have the staff table yet. That must never
        // upgrade a normal user into staff, so fail closed to "no staff role".
        return null
      }
    },
  }

  return resolveAuthenticatedUser(payload, repository)
}

export { signToken, verifyToken } from "@/lib/auth-local"
