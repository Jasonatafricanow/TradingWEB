import { NextResponse } from "next/server";
import { getVersionInfo } from "@/lib/version";

/**
 * GET /api/version — 公开版本探针（版本更新模块）。
 *
 * 只暴露非敏感字段（应用版本 / 构建 ID / 构建时间），供：
 * - 客户端轮询检测新部署（VersionUpdateNotifier）
 * - 热部署脚本的健康检查（release.sh）
 *
 * 必须 no-store：反向代理/CDN 缓存会导致客户端检测不到新版本。
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const info = getVersionInfo();
  return NextResponse.json(
    {
      data: {
        appVersion: info.appVersion,
        buildId: info.buildId,
        builtAt: info.builtAt,
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}