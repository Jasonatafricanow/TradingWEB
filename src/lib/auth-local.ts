/**
 * 本地认证工具 — 零外部依赖
 *
 * 使用 Node.js 内置 crypto 模块实现：
 * - PBKDF2 密码哈希（等同 bcrypt 安全级别）
 * - HMAC-SHA256 JWT 签名
 */

import { randomBytes, createHmac, pbkdf2Sync, timingSafeEqual } from 'node:crypto'

// ==================== JWT ====================

export const DEFAULT_JWT_SECRET = 'dev-jwt-secret-do-not-use-in-production'

export function resolveJwtSecret(env: { NODE_ENV?: string; JWT_SECRET?: string } = process.env): string {
  const secret = env.JWT_SECRET?.trim()
  if (env.NODE_ENV === 'production' && (!secret || secret === DEFAULT_JWT_SECRET)) {
    throw new Error('JWT_SECRET must be configured to a strong non-default value in production')
  }
  return secret || DEFAULT_JWT_SECRET
}

export function safeTimingEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

const JWT_SECRET = resolveJwtSecret()
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d' // 7 days

function base64Url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  return Buffer.from(str, 'base64').toString('utf-8')
}

function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([dhms])$/)
  if (!match) return 7 * 86400000 // default 7 days
  const num = parseInt(match[1])
  const unit = match[2]
  const ms = { d: 86400000, h: 3600000, m: 60000, s: 1000 }
  return num * (ms[unit as keyof typeof ms] || 86400000)
}

export interface JwtPayload {
  sub: string       // user_id
  email: string
  role?: string
  pwdv?: string     // password-reset credential version
  iat: number       // issued at
  exp: number       // expires at
}

export function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>, expiry?: string): string {
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + Math.floor(parseExpiry(expiry || JWT_EXPIRY) / 1000)
  const fullPayload = { ...payload, iat, exp }

  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64Url(JSON.stringify(fullPayload))
  const signature = createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `${header}.${body}.${signature}`
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [header, body, signature] = parts

    // Verify signature
    const expectedSig = createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')

    if (!safeTimingEqualString(signature, expectedSig)) {
      return null
    }

    const payload = JSON.parse(base64UrlDecode(body)) as JwtPayload

    // Check expiry
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

// ==================== 密码哈希 ====================

const HASH_ITERATIONS = 100000
const HASH_KEYLEN = 64
const HASH_DIGEST = 'sha512'
const SALT_LENGTH = 16

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex')
  const hash = pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const computed = pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST).toString('hex')
  return safeTimingEqualString(computed, hash)
}

// ==================== 生成随机 token ====================

export function generateToken(length = 32): string {
  return randomBytes(length).toString('hex')
}


/**
 * Bind password-reset tokens to the user's current credential state.
 * After a successful password change the version changes, so old reset
 * links (including the one just consumed) can no longer be reused.
 */
export function passwordResetVersion(passwordHash: string | null): string {
  return createHmac("sha256", JWT_SECRET)
    .update(passwordHash ?? "<unset-password>")
    .digest("hex")
}
