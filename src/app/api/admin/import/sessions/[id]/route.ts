/**
 * GET /api/admin/import/sessions/:id  — 单 session 详情
 *
 * 返回值含：基本字段 + jobs[] + mirror_progress（图片镜像进度）
 * 守门：requireStaffRole(['admin','operator'])
 * 契约见 standardized import contract §3.4
 */
import { NextResponse } from "next/server";
import {
  requireStaffRole,
  errorResponse,
} from "@/services/auth/auth-middleware";
import { getImportSessionDetail } from "@/services/import/session-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const { id } = await params;
    const detail = await getImportSessionDetail(id);
    return NextResponse.json(detail);
  } catch (err) {
    return errorResponse(err);
  }
}
