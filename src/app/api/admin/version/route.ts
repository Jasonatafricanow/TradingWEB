import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { getVersionInfo } from "@/lib/version";

/**
 * GET /api/admin/version — 管理端版本详情（版本更新模块）。
 *
 * 需要 admin / operator 角色；比公开探针多返回 git 提交、分支、
 * 进程启动时间与运行时长，供后台「版本与更新」页展示。
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const info = getVersionInfo();
    const uptimeSeconds = Math.max(
      0,
      Math.floor((Date.now() - Date.parse(info.startedAt)) / 1000),
    );
    return NextResponse.json(
      { data: { ...info, uptimeSeconds } },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    return errorResponse(err);
  }
}