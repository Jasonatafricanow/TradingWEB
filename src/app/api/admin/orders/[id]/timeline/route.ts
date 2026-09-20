import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { db } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { orderTimeline } from '@/storage/database/shared/schema';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin", "operator", "support"]);
    await requireUser(request);
    const { id } = await params;
    const data = await db.select().from(orderTimeline)
      .where(eq(orderTimeline.order_id, id))
      .orderBy(desc(orderTimeline.created_at));
    return NextResponse.json({ data: data || [] });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin", "operator", "support"]);
    await requireUser(request);
    const { id } = await params;
    const body = await request.json();
    const { action, description, operator_id } = body;

    await db.insert(orderTimeline).values({
      order_id: id,
      action: action || 'note',
      description: description || '',
      operator_id: operator_id || null,
    });

    // Fetch the last inserted entry
    const [rows] = await db.$client.execute(
      'SELECT * FROM order_timeline WHERE order_id = ? ORDER BY created_at DESC LIMIT 1',
      [id]
    );
    const entry = (rows as Record<string, unknown>[])[0];
    return NextResponse.json({ data: entry });
  } catch (err) {
    return errorResponse(err);
  }
}