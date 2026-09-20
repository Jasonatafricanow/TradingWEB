import { NextResponse } from 'next/server';
import { requireStaffRole, errorResponse } from '@/services/auth/auth-middleware';
import { getVariants, bulkSaveVariants } from '@/services/products/variant-service';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ['admin', 'operator']);
    const { id } = await params;
    const result = await getVariants(id);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ['admin', 'operator']);
    const { id } = await params;
    const body = await request.json();

    // body should contain { variants: [...] }
    const variants = body.variants || body || [];
    const result = await bulkSaveVariants(id, variants);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
