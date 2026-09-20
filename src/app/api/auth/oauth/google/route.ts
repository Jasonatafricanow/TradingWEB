import { NextRequest, NextResponse } from "next/server"
import { verifyGoogleToken, findOrCreateUser } from "@/lib/oauth"
import { signToken } from "@/lib/auth-local"

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
    const message = err instanceof Error ? err.message : "Google login failed"
    return NextResponse.json({ error: message }, { status: 401 })
  }
}
