import { NextResponse } from "next/server";
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import {
  deleteUrlRedirect,
  listUrlRedirects,
  upsertUrlRedirect,
} from "@/services/admin/redirect-service";

export async function GET(request: Request) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page"));
    const pageSize = Number(url.searchParams.get("pageSize"));
    const result = await listUrlRedirects({
      search: url.searchParams.get("search") || undefined,
      source: url.searchParams.get("source") || undefined,
      source_store: url.searchParams.get("source_store") || undefined,
      page: Number.isFinite(page) ? page : undefined,
      pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const body = await request.json();
    const data = await upsertUrlRedirect({
      old_path: body.old_path,
      new_path: body.new_path,
      status_code: body.status_code,
      source: body.source,
      source_store: body.source_store,
      source_id: body.source_id,
      is_active: body.is_active ?? true,
    });
    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(request: Request) {
  return POST(request);
}

export async function DELETE(request: Request) {
  try {
    await requireStaffRole(request, ["admin"]);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const result = await deleteUrlRedirect(id);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
