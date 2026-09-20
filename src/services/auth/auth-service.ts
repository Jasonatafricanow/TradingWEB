/**
 * 本地认证服务 — 使用 JWT + 数据库
 */
import { verifyToken, signToken } from "@/lib/auth-local"
import { IS_DEMO_MODE } from '@/config/constants'

export interface AuthenticatedUser {
  id: string
  email: string
  name?: string | null
  role?: string
  staffId?: string
}

/**
 * 从 Authorization header 解析 JWT 并返回用户
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
  const { db } = await import('@/lib/db')

  const [rows] = await db.$client.execute(
    'SELECT id, email, name FROM users WHERE id = ? LIMIT 1',
    [payload.sub]
  )
  const users = rows as { id: string; email: string; name: string | null }[]
  if (users.length === 0) return null

  const user = users[0]

  // 检查是否是员工
  let role: string | undefined
  let staffId: string | undefined
  try {
    const [staffRows] = await db.$client.execute(
      'SELECT id, role FROM staff WHERE user_id = ? OR email = ? LIMIT 1',
      [user.id, user.email]
    )
    const staff = (staffRows as { id: string; role: string }[])[0]
    if (staff) {
      role = staff.role
      staffId = staff.id
    }
  } catch {
    // staff table 可能不存在
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role,
    staffId,
  }
}

export { signToken, verifyToken } from "@/lib/auth-local"
