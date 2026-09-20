import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { listAuditLogs } from "@/services/admin/audit-service"

// GET /api/admin/audit-logs
export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ['admin', 'operator']);
    const { searchParams } = new URL(request.url)
    const opts = {
      search: searchParams.get('search') || undefined,
      action: searchParams.get('action') || undefined,
      entityType: searchParams.get('entity_type') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '50'),
    }
    const result = await listAuditLogs(opts)
    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}
