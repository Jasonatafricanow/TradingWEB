import { NextResponse } from "next/server";
import { listActiveProducts } from "@/services/products/product-service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || undefined;
    const category = searchParams.get("category") || undefined;
    const rawLimit = Number(searchParams.get("limit"));
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined;

    const result = await listActiveProducts({ type, category, limit });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? (err as Error).message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
