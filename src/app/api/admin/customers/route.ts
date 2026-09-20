import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { listCustomers, getCustomerDetail } from "@/services/admin/customer-service"
import { db } from "@/lib/db"
import { users } from "@/storage/database/shared/schema"
import { eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"

// GET /api/admin/customers?page=&pageSize=&search=
export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator", "support"]);
    const params = request.nextUrl.searchParams;
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 50;
    const search = params.get("search")?.trim();
    const result = await listCustomers({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      search: search || undefined,
    })
    return NextResponse.json(result)
  } catch (err) { return errorResponse(err) }
}

// POST /api/admin/customers — 后台手动创建客户（仅落地 users 表，不发邀请邮件）
export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"])
    const body = await request.json()
    const email = String(body.email || "").trim().toLowerCase()
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "邮箱无效" }, { status: 400 })
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
    if (existing) {
      return NextResponse.json({ error: "邮箱已被注册" }, { status: 409 })
    }

    const id = randomUUID()
    await db.insert(users).values({
      id,
      email,
      name: body.name || null,
      phone: body.phone || null,
      is_active: true,
    })

    const [data] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1)

    return NextResponse.json({ data })
  } catch (err) {
    return errorResponse(err)
  }
}
