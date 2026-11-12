import { NextRequest, NextResponse } from "next/server"
import { verifyAppleAuthorizationCode, findOrCreateUser } from "@/lib/oauth"
import { getUserFromToken, signSessionToken } from "@/services/auth/auth-service"
import { API_MESSAGES } from "@/lib/api-messages";

export async function POST(request: NextRequest) {
  try {
    const { authorizationCode, redirectUri, user: userInfo, link } = await request.json()
    
    if (!authorizationCode) {
      return NextResponse.json({ error: "Missing authorization code" }, { status: 400 })
    }

    // Apple returns user info only on first login
    const name = userInfo?.name || (userInfo?.email?.split?.("@")?.[0]) || "User"

    // Verify with Apple's server
    const appleUser = await verifyAppleAuthorizationCode(authorizationCode, redirectUri || process.env.APPLE_REDIRECT_URI || "")
    
    let linkUserId: string | undefined;
    if (link === true) {
      const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
      const user = bearer ? await getUserFromToken(bearer) : null;
      if (!user) return NextResponse.json({ error: API_MESSAGES.signInBeforeLinking }, { status: 401 });
      linkUserId = user.id;
    }
    // Find or create user
    const result = await findOrCreateUser(appleUser.email, name, { provider: "apple", subject: appleUser.appleId }, linkUserId)

    // Issue our JWT
    const token = signSessionToken(result, result.passwordHash)

    return NextResponse.json({
      data: {
        token,
        user: { id: result.id, email: result.email, name: result.name },
        isNew: result.isNew,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Apple login failed"
    return NextResponse.json({ error: message }, { status: 401 })
  }
}
