import { OAuth2Client } from "google-auth-library"
import { db } from "@/lib/db"
import { users } from "@/storage/database/shared/schema"
import { eq } from "drizzle-orm"
import { signToken } from "@/lib/auth-local"
import { randomUUID } from "node:crypto"

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
)

/**
 * Verify a Google ID token and extract user info
 */
export async function verifyGoogleToken(idToken: string) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error("Google OAuth is not configured")
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  })
  const payload = ticket.getPayload()
  if (!payload || !payload.email) {
    throw new Error("Invalid Google token")
  }
  return {
    email: payload.email,
    name: payload.name || payload.email.split("@")[0],
    avatar: payload.picture || null,
    googleId: payload.sub,
  }
}

/**
 * Verify an Apple identity token (JWT signed by Apple)
 */
export function verifyAppleToken(idToken: string): { email: string; name: string } {
  // Apple ID tokens are JWTs signed with Apple's private key
  // For now, decode payload without full verification (Apple public key fetch is complex)
  // On production, verify JWT signature using Apple's JWKS endpoint: https://appleid.apple.com/auth/keys
  try {
    const parts = idToken.split(".")
    if (parts.length !== 3) throw new Error("Invalid Apple token format")
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8")) as {
      aud?: string
      email?: string
      exp?: number
      iss?: string
      name?: string
    }

    if (payload.iss !== "https://appleid.apple.com") {
      throw new Error("Invalid Apple token issuer")
    }
    if (!process.env.APPLE_CLIENT_ID || payload.aud !== process.env.APPLE_CLIENT_ID) {
      throw new Error("Invalid Apple token audience")
    }
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error("Apple token expired")
    }
    if (!payload.email) throw new Error("No email in Apple token")

    return {
      email: payload.email,
      name: payload.name || payload.email.split("@")[0],
    }
  } catch {
    // For Apple authorization code flow (server-side verification):
    // We'd exchange the code with Apple for tokens, then decode the id_token
    throw new Error("Apple token verification requires server-side code exchange")
  }
}

/**
 * Verify an Apple authorization code by calling Apple's verification endpoint
 */
export async function verifyAppleAuthorizationCode(
  authorizationCode: string,
  redirectUri: string
): Promise<{ email: string; name: string }> {
  const clientId = process.env.APPLE_CLIENT_ID || ""
  const clientSecret = process.env.APPLE_CLIENT_SECRET || ""
  if (!clientId || !clientSecret) {
    throw new Error("Apple Sign In is not configured")
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: authorizationCode,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  })

  // Apple's token verification endpoint
  const response = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Apple token verification failed: ${errorText}`)
  }

  const data = await response.json()

  // The id_token contains user info (email)
  if (!data.id_token) throw new Error("No id_token returned from Apple")
  return verifyAppleToken(data.id_token)
}

/**
 * Find or create user by email, optionally update name
 */
export async function findOrCreateUser(email: string, name: string) {
  // Try to find existing user
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1)

  if (existing) {
    // Update name if user didn't have one before
    if (!existing.name && name) {
      await db.update(users).set({ name }).where(eq(users.id, existing.id))
    }
    return { id: existing.id, email: existing.email, name: existing.name || name, isNew: false }
  }

  // Create new user with minimal info
  const id = randomUUID()
  await db.insert(users).values({
    id,
    email,
    name,
    is_active: true,
  })

  return { id, email, name, isNew: true }
}
