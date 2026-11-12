import { NextRequest, NextResponse } from "next/server";
import { revokeSession } from "@/services/auth/auth-service";
import { errorResponse } from "@/services/auth/auth-middleware";
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (token) await revokeSession(token);
    return NextResponse.json({ data: { signedOut: true } });
  } catch (error) { return errorResponse(error); }
}
