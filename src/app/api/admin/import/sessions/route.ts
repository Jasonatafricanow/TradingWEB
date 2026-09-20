/**
 * POST /api/admin/import/sessions  — 创建 import 会话
 * GET  /api/admin/import/sessions  — 列出 session（分页 + 过滤）
 *
 * 守门：requireStaffRole(['admin','operator'])
 * 契约见 standardized import contract §3.1
 */
import { NextResponse } from "next/server";
import {
  requireStaffRole,
  requireUser,
  errorResponse,
} from "@/services/auth/auth-middleware";
import {
  createImportSession,
  listImportSessions,
} from "@/services/import/session-service";
import type {
  CreateImportSessionRequest,
  ImportSessionStatus,
  ImportSource,
} from "@/types/import-contract";

export async function POST(request: Request) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const user = await requireUser(request);
    const body = (await request.json()) as CreateImportSessionRequest;
    const result = await createImportSession(user, body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET(request: Request) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const url = new URL(request.url);

    const pageParam = url.searchParams.get("page");
    const pageSizeParam = url.searchParams.get("pageSize");

    const result = await listImportSessions({
      source: (url.searchParams.get("source") as ImportSource | null) ?? undefined,
      source_store: url.searchParams.get("source_store") ?? undefined,
      status:
        (url.searchParams.get("status") as ImportSessionStatus | null) ?? undefined,
      page: pageParam ? Number(pageParam) : undefined,
      pageSize: pageSizeParam ? Number(pageSizeParam) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
