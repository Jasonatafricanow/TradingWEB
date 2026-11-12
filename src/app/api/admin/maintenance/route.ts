import { NextRequest, NextResponse } from "next/server"
import { requireUser, requireStaffRole, errorResponse } from "@/services/auth/auth-middleware"
import { db } from '@/lib/db'

// Maintenance mode is stored only: no middleware or page reads it, so the
// storefront stays open whatever the flag says. Responses carry
// `enforced: false` so callers cannot mistake the flag for a closed shop.

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
      enforced: false,
    })
  } catch (err) {
    // Previously any error (including a failed admin check) answered 200.
    return errorResponse(err)
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

    return NextResponse.json({ maintenance_mode: !!body.enabled, enforced: false })
  } catch (err) {
    return errorResponse(err)
  }
}
