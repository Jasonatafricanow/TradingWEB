import { NextResponse } from 'next/server';
import { getVariants } from '@/services/products/variant-service';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await getVariants(id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message, data: [] }, { status: 500 });
  }
}