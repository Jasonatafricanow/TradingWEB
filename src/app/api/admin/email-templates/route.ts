import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { db } from '@/lib/db'
import { eq, asc } from 'drizzle-orm'
import { emailTemplates } from '@/storage/database/shared/schema'

// GET /api/admin/email-templates
export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const data = await db.select().from(emailTemplates).orderBy(asc(emailTemplates.key));
    return NextResponse.json({ data: data || [] })
  } catch (err) {
    return errorResponse(err)
  }
}

// PUT /api/admin/email-templates — 更新模板
export async function PUT(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    await requireUser(request)
    const body = await request.json()
    const { id, subject, body_html, is_active } = body

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    const updateData: Record<string, unknown> = { updated_at: new Date() }
    if (subject !== undefined) updateData.subject = subject
    if (body_html !== undefined) updateData.body_html = body_html
    if (is_active !== undefined) updateData.is_active = is_active

    await db.update(emailTemplates).set(updateData as Partial<typeof emailTemplates.$inferInsert>).where(eq(emailTemplates.id, id));
    const [data] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, id)).limit(1);
    return NextResponse.json({ data })
  } catch (err) {
    return errorResponse(err)
  }
}
