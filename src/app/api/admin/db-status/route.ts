import { NextResponse } from 'next/server';
import { requireStaffRole, errorResponse } from '@/services/auth/auth-middleware';
import { testDbConnection } from '@/lib/db-test';

export async function GET(request: Request) {
  try {
    await requireStaffRole(request, ['admin', 'operator']);
    const status = await testDbConnection();
    return NextResponse.json(status);
  } catch (err) {
    return errorResponse(err);
  }
}
