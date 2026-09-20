import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { approveReview } from "@/services/review-service"
import { AppError } from "@/lib/errors";

const BULK_ID_LIMIT = 200

/**
 * POST /api/admin/reviews/bulk
 * Body: { ids: string[], approved: boolean }
 *
 * 限制：
 *  - ids 数组长度 ≤ BULK_ID_LIMIT
 *  - approved 必须是 boolean
 *  - 逐条调用 approveReview；某条失败不影响其它条目
 *  - 响应：{ data: { ok, fail, errors: Array<{id, message}> } }
 *
 * 错误码（可映射到 i18n key）：
 *  - BULK_EMPTY_IDS     → "请填写至少 1 个评论 ID"
 *  - BULK_TOO_MANY      → "单次最多 {n} 个"
 *  - BULK_BAD_APPROVED  → "approved 必须是布尔值"
 */
export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator", "support"]);
    await requireUser(request);
    const body = await request.json() as {
      ids?: unknown;
      approved?: unknown;
    };

    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];

    if (ids.length === 0) {
      throw new AppError("BULK_EMPTY_IDS", 400, "BULK_EMPTY_IDS");
    }
    if (ids.length > BULK_ID_LIMIT) {
      throw new AppError("BULK_TOO_MANY", 400, `Single call supports at most ${BULK_ID_LIMIT} ids`);
    }
    if (typeof body.approved !== "boolean") {
      throw new AppError("BULK_BAD_APPROVED", 400, "approved must be boolean");
    }

    let ok = 0;
    let fail = 0;
    const errors: Array<{ id: string; message: string }> = [];

    for (const id of ids) {
      try {
        await approveReview(id, body.approved);
        ok += 1;
      } catch (error) {
        fail += 1;
        errors.push({ id, message: error instanceof Error ? error.message : "Unknown error" });
      }
    }

    return NextResponse.json({ data: { ok, fail, errors } });
  } catch (err) {
    return errorResponse(err);
  }
}
