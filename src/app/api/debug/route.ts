import { NextResponse } from "next/server"
import { IS_DEMO_MODE } from "@/config/constants"
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"

export async function GET(request: Request) {
  try {
    if (process.env.NODE_ENV === "production") {
      await requireStaffRole(request, ["admin"])
    }

    return NextResponse.json({
      IS_DEMO_MODE,
      DB_HOST: process.env.DB_HOST ? "(set)" : "(not set)",
      JWT_SECRET: process.env.JWT_SECRET ? "(set)" : "(not set)",
      NODE_ENV: process.env.NODE_ENV,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
