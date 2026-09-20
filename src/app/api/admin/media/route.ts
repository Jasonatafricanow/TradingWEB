import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { deleteMediaStorageObject } from "@/services/media/media-storage";

export const runtime = "nodejs";

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

async function getDb() {
  return (await import("@/lib/db")).db;
}

async function getMediaTable() {
  return (await import("@/storage/database/shared/schema")).mediaLibrary;
}

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);

    const url = new URL(request.url);
    const search = (url.searchParams.get("search") || "").trim().slice(0, 100);
    const page = parsePositiveInt(url.searchParams.get("page"), 1, 10000);
    const limit = parsePositiveInt(url.searchParams.get("limit"), 50, 100);
    const offset = (page - 1) * limit;

    const db = await getDb();
    const mediaTable = await getMediaTable();

    const whereClause = search
      ? and(like(mediaTable.original_name, `%${search}%`))
      : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(mediaTable)
        .where(whereClause)
        .orderBy(desc(mediaTable.created_at))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql`count(*)` })
        .from(mediaTable)
        .where(whereClause)
        .then((r) => Number(r[0]?.count || 0)),
    ]);

    return NextResponse.json({
      data: rows,
      total: countResult,
      page,
      limit,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin"]);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const db = await getDb();
    const mediaTable = await getMediaTable();

    const [record] = await db
      .select()
      .from(mediaTable)
      .where(eq(mediaTable.id, id))
      .limit(1);

    if (!record) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }

    await deleteMediaStorageObject({ filename: record.filename, url: record.url });

    await db.delete(mediaTable).where(eq(mediaTable.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
