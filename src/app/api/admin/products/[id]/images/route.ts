import { NextResponse } from "next/server";
import { asc, and, eq, notInArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { productImages, products } from "@/storage/database/shared/schema";
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";

interface ProductImageInput {
  id?: string | null;
  src?: string | null;
  original_url?: string | null;
  alt?: string | null;
  variant_id?: string | null;
  position?: number | null;
  mirror_status?: string | null;
}

function cleanText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function cleanMirrorStatus(value: unknown): string {
  const status = cleanText(value);
  if (status && ["pending", "mirrored", "failed", "skipped"].includes(status)) return status;
  return "mirrored";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const { id } = await params;
    const rows = await db
      .select()
      .from(productImages)
      .where(eq(productImages.product_id, id))
      .orderBy(asc(productImages.position), asc(productImages.created_at));

    return NextResponse.json({ data: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const { id } = await params;
    const body = await request.json();
    const images = Array.isArray(body.images) ? (body.images as ProductImageInput[]) : [];

    const data = await db.transaction(async (tx) => {
      const [product] = await tx.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
      if (!product) {
        return { notFound: true, data: [] };
      }

      const incomingIds = images
        .map((image) => cleanText(image.id))
        .filter((imageId): imageId is string => Boolean(imageId));

      if (incomingIds.length > 0) {
        await tx
          .delete(productImages)
          .where(and(eq(productImages.product_id, id), notInArray(productImages.id, incomingIds)));
      } else {
        await tx.delete(productImages).where(eq(productImages.product_id, id));
      }

      for (let index = 0; index < images.length; index++) {
        const image = images[index];
        const src = cleanText(image.src);
        if (!src) continue;

        const values = {
          product_id: id,
          variant_id: cleanText(image.variant_id),
          src,
          original_url: cleanText(image.original_url) || src,
          mirror_status: cleanMirrorStatus(image.mirror_status),
          alt: cleanText(image.alt),
          position: Number.isFinite(Number(image.position)) ? Number(image.position) : index + 1,
        };

        const imageId = cleanText(image.id);
        if (imageId) {
          await tx
            .update(productImages)
            .set(values)
            .where(and(eq(productImages.id, imageId), eq(productImages.product_id, id)));
        } else {
          await tx.insert(productImages).values({ id: randomUUID(), ...values });
        }
      }

      const rows = await tx
        .select()
        .from(productImages)
        .where(eq(productImages.product_id, id))
        .orderBy(asc(productImages.position), asc(productImages.created_at));

      return { notFound: false, data: rows };
    });

    if (data.notFound) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json({ data: data.data });
  } catch (err) {
    return errorResponse(err);
  }
}
