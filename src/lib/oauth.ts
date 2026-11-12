import { OAuth2Client } from "google-auth-library"
import { db } from "@/lib/db"
import { users, oauthIdentities } from "@/storage/database/shared/schema"
import { and, eq } from "drizzle-orm"
import { createPublicKey, verify, randomUUID } from "node:crypto"

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
  if (!payload || !payload.email || !payload.sub) {
    throw new Error("Invalid Google token")
  }
  // findOrCreateUser links by email, so an unverified address would let a
  // Google account that merely claims someone's email sign in as them.
  if (payload.email_verified !== true) {
    throw new Error("Google account email is not verified")
  }
  return {
    email: payload.email.trim().toLowerCase(),
    name: payload.name || payload.email.split("@")[0],
    avatar: payload.picture || null,
    googleId: payload.sub,
  }
}

/**
 * Verify an Apple identity token (JWT signed by Apple)
 */
export async function verifyAppleToken(idToken: string): Promise<{ email: string; name: string; appleId: string }> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid Apple token");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Invalid Apple signing algorithm");
  const response = await fetch("https://appleid.apple.com/auth/keys", { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Apple signing keys unavailable");
  const { keys } = await response.json();
  const jwk = keys.find((key: { kid: string; kty: string }) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk || !verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(parts[2], "base64url"))) {
    throw new Error("Invalid Apple signature");
  }
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  if (payload.iss !== "https://appleid.apple.com" || !process.env.APPLE_CLIENT_ID || payload.aud !== process.env.APPLE_CLIENT_ID
    || !Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)
    || typeof payload.sub !== "string" || !payload.sub || typeof payload.email !== "string"
    || ![true, "true"].includes(payload.email_verified)) throw new Error("Invalid Apple identity claims");
  return { email: payload.email.trim().toLowerCase(), name: payload.email.split("@")[0], appleId: payload.sub };
}

/**
 * Verify an Apple authorization code by calling Apple's verification endpoint
 */
export async function verifyAppleAuthorizationCode(
  authorizationCode: string,
  redirectUri: string
): Promise<{ email: string; name: string; appleId: string }> {
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

/** Stable provider subjects identify users. Email matches require explicit authenticated linking. */
export async function findOrCreateUser(email: string, name: string, identity: { provider: 'google' | 'apple'; subject: string }, linkUserId?: string) {
  if (!identity.subject || identity.subject.length > 255) throw new Error("Invalid provider subject");
  email = email.trim().toLowerCase();
  return db.transaction(async tx => {
    const [binding] = await tx.select().from(oauthIdentities).where(and(eq(oauthIdentities.provider, identity.provider), eq(oauthIdentities.subject, identity.subject))).limit(1);
    if (binding && linkUserId && binding.user_id !== linkUserId) throw new Error("Identity is already linked to another account");
    const [existing] = await tx.select().from(users).where(binding || linkUserId ? eq(users.id, binding?.user_id || linkUserId!) : eq(users.email, email)).limit(1);
    if (existing) {
      if (!existing.is_active) throw new Error("Account is inactive");
      if (!binding && linkUserId !== existing.id) throw new Error("Sign in with your password or reset it, then explicitly link this sign-in method in your account.");
      if (!binding) await tx.insert(oauthIdentities).values({ id: randomUUID(), user_id: existing.id, provider: identity.provider, subject: identity.subject });
      return { id: existing.id, email: existing.email, name: existing.name || name, passwordHash: existing.password_hash ?? null, isNew: false };
    }
    if (binding || linkUserId) throw new Error("Account not found");
    const id = randomUUID();
    await tx.insert(users).values({ id, email, name, is_active: true });
    await tx.insert(oauthIdentities).values({ id: randomUUID(), user_id: id, provider: identity.provider, subject: identity.subject });
    return { id, email, name, passwordHash: null, isNew: true };
  });
}
