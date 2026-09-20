import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { processRefund } from "@/services/admin/refund-service"
import { RefundStatus } from "@/lib/enums"

const BULK_ACTION_WHITELIST = new Set<string>([
  RefundStatus.Approved,
  RefundStatus.Rejected,
])

const BULK_ID_LIMIT = 200

/**
 * POST /api/admin/refunds/bulk
 * Body: { ids: string[], action: "approved" | "rejected", admin_note?: string }
 *
 * 限制：
 *  - action 必须在白名单（仅允许 approved/rejected，returned/completed 涉及库存和回退，单独走单条接口）
 *  - ids 数组长度 ≤ BULK_ID_LIMIT
 *  - 逐条调用 processRefund；某条失败不影响其它条目
 *  - 响应：{ ok: number, fail: number, errors: Array<{id, message}> }
 */
export async function POST(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const user = await requireUser(request);
    const body = await request.json() as {
      ids?: unknown;
      action?: unknown;
      admin_note?: unknown;
    };

    const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
    const action = typeof body.action === "string" ? body.action : "";
    const adminNote = typeof body.admin_note === "string" ? body.admin_note : undefined;

    if (ids.length === 0) {
      return NextResponse.json({ error: "ids must be a non-empty array" }, { status: 400 });
    }
    if (ids.length > BULK_ID_LIMIT) {
      return NextResponse.json(
        { error: `Bulk supports at most ${BULK_ID_LIMIT} ids` },
        { status: 400 },
      );
    }
    if (!BULK_ACTION_WHITELIST.has(action)) {
      return NextResponse.json(
        { error: `action must be one of: ${Array.from(BULK_ACTION_WHITELIST).join(", ")}` },
        { status: 400 },
      );
    }

    let ok = 0;
    let fail = 0;
    const errors: Array<{ id: string; message: string }> = [];

    for (const id of ids) {
      try {
        // 复用现有单条 service，admin_note 透传；类型断言安全（白名单已过滤）
        await processRefund(id, action as "approved" | "rejected", adminNote, user.id);
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
