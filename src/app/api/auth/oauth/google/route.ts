import { NextRequest, NextResponse } from "next/server"
import { verifyGoogleToken, findOrCreateUser } from "@/lib/oauth"
import { signSessionToken } from "@/services/auth/auth-service"

export async function POST(request: NextRequest) {
  try {
    const { credential } = await request.json()
    if (!credential) {
      return NextResponse.json({ error: "Missing credential" }, { status: 400 })
    }

    // Verify Google ID token
    const googleUser = await verifyGoogleToken(credential)
    
    // Find or create user in our database
    const result = await findOrCreateUser(googleUser.email, googleUser.name)
    
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
    const message = err instanceof Error ? err.message : "Google login failed"
    return NextResponse.json({ error: message }, { status: 401 })
  }
}
