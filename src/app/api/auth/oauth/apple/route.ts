import { NextRequest, NextResponse } from "next/server"
import { verifyAppleAuthorizationCode, findOrCreateUser } from "@/lib/oauth"
import { signToken } from "@/lib/auth-local"

export async function POST(request: NextRequest) {
  try {
    const { authorizationCode, redirectUri, user: userInfo } = await request.json()
    
    if (!authorizationCode) {
      return NextResponse.json({ error: "Missing authorization code" }, { status: 400 })
    }

    // Apple returns user info only on first login
    const name = userInfo?.name || (userInfo?.email?.split?.("@")?.[0]) || "User"

    // Verify with Apple's server
    const appleUser = await verifyAppleAuthorizationCode(authorizationCode, redirectUri || process.env.APPLE_REDIRECT_URI || "")
    
    // Find or create user
    const result = await findOrCreateUser(appleUser.email, name)

    // Issue our JWT
    const token = signToken({
      sub: result.id,
      email: result.email,
      role: "customer",
    })

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
