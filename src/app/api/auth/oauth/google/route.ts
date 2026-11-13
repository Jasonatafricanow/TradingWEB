import { NextRequest, NextResponse } from "next/server"
import { verifyGoogleToken, findOrCreateUser } from "@/lib/oauth"
import { getUserFromToken, signSessionToken } from "@/services/auth/auth-service"
import { API_MESSAGES } from "@/lib/api-messages";

export async function POST(request: NextRequest) {
  try {
    const { credential, link } = await request.json()
    if (!credential) {
      return NextResponse.json({ error: "Missing credential" }, { status: 400 })
    }

    // Verify Google ID token
    const googleUser = await verifyGoogleToken(credential)
    
    let linkUserId: string | undefined;
    if (link === true) {
      const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
      const user = bearer ? await getUserFromToken(bearer) : null;
      if (!user) return NextResponse.json({ error: API_MESSAGES.signInBeforeLinking }, { status: 401 });
      linkUserId = user.id;
    }
    // Find or create user in our database
    const result = await findOrCreateUser(googleUser.email, googleUser.name, { provider: "google", subject: googleUser.googleId }, linkUserId)
    
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
