import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { db } from '@/lib/db'

// GET /api/admin/maintenance
export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin"]);
    const [rows] = await db.$client.execute(
      "SELECT value FROM site_settings WHERE `key` = ?",
      ['maintenance_mode']
    );
    const data = (rows as Record<string, unknown>[])[0];

    return NextResponse.json({
      maintenance_mode: data?.value === "true",
    })
  } catch {
    return NextResponse.json({ maintenance_mode: false })
  }
}

// PUT /api/admin/maintenance
export async function PUT(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin"]);
    await requireUser(request)
    const body = await request.json()

    await db.$client.execute(
      'INSERT INTO site_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
      ['maintenance_mode', body.enabled ? 'true' : 'false']
    );

    return NextResponse.json({ maintenance_mode: !!body.enabled })
  } catch (err) {
    return errorResponse(err)
  }
}
