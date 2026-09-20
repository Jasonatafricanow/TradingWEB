import { NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { listStaff } from "@/services/admin/staff-service"

/**
 * GET /api/admin/staff/me
 * 返回当前登录员工的信息（角色、姓名等）
 */
export async function GET(request: Request) {
  try {
    await requireStaffRole(request, ['admin', 'manager', 'operator', 'support']);
    const user = await requireUser(request);
    const result = await listStaff();
    const staffList = result.data || [];
    const me = staffList.find((staffMember: Record<string, unknown>) => staffMember.email === user.email);
    return NextResponse.json({
      data: me || { id: user.staffId, email: user.email, role: user.role, name: user.email.split('@')[0] },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
