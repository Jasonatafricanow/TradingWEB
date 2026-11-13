"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Star, ShoppingCart, ArrowRight, Check, Truck, ShieldCheck } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/cart-context";
import { useUI } from "@/contexts/ui-context";
import { useCurrency } from "@/contexts/currency-context";
import { useI18n } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";
import { pushRecent } from "@/components/command-palette";

interface QuickVariant {
  id: string;
  title: string | null;
  price: string | number | null;
  stock?: number | null;
}

interface QuickProduct {
  id: string;
  title: string;
  title_en: string | null;
  description: string | null;
  description_en: string | null;
  price: string;
  compare_at_price?: string | null;
  type: string;
  image_key: string | null;
  images?: { src: string }[];
  rating?: number;
  review_count?: number;
  stock?: number;
  vendor?: string;
  highlights?: string[];
  highlights_en?: string[];
}

export function QuickView({
  productId,
  open,
  onOpenChange,
}: {
  productId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const { format } = useCurrency();
  const { addItem } = useCart();
  const { openCart } = useUI();
  const [product, setProduct] = useState<QuickProduct | null>(null);
  const [variants, setVariants] = useState<QuickVariant[]>([]);
  const [selected, setSelected] = useState<QuickVariant | null>(null);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!open || !productId) return;
    let active = true;
    setLoading(true);
    setProduct(null);
    setVariants([]);
    setSelected(null);
    setAdded(false);

    fetch(`/api/products/${productId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!active) return;
        const p = j.data as QuickProduct | undefined;
        setProduct(p ?? null);
        if (p) pushRecent({ id: p.id, title: locale === "zh" ? p.title : p.title_en || p.title, image_key: p.image_key });
      })
      .catch(() => { if (active) setProduct(null); })
      .finally(() => { if (active) setLoading(false); });

    fetch(`/api/products/${productId}/variants`)
      .then((r) => r.json())
      .then((j) => { if (active) setVariants(j.data || []); })
      .catch(() => {});

    return () => { active = false; };
  }, [open, productId, locale]);

  const loc = (field: "title" | "description") => {
    if (!product) return "";
    const rec = product as unknown as Record<string, string | null>;
    if (locale === "zh") return rec[field] || "";
    return rec[`${field}_${locale}`] || rec[`${field}_en`] || rec[field] || "";
  };

  const price = selected?.price ? Number(selected.price) : Number(product?.price || 0);
  const compareAt = product?.compare_at_price ? Number(product.compare_at_price) : 0;
  const highlights = (locale === "zh" ? product?.highlights : product?.highlights_en || product?.highlights) ?? [];
  const gallery = [product?.image_key, ...(product?.images || []).map((i) => i.src)].filter(Boolean) as string[];

  const handleAdd = () => {
    if (!product) return;
    if (variants.length > 0 && !selected) return;
    addItem({
      id: product.id,
      title: selected?.title ? `${loc("title")} · ${selected.title}` : loc("title"),
      price,
      type: product.type,
      image_key: product.image_key,
      variant_id: selected?.id ?? null,
      variant_name: selected?.title ?? null,
    });
    setAdded(true);
    window.setTimeout(() => {
      onOpenChange(false);
      openCart();
    }, 420);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden rounded-2xl border border-border p-0 sm:max-w-3xl">
        <DialogTitle className="sr-only">{product ? loc("title") : t("quick.title")}</DialogTitle>
        {loading || !product ? (
          <div className="grid gap-0 sm:grid-cols-2">
            <div className="aspect-square animate-pulse bg-muted" />
            <div className="space-y-3 p-6">
              <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-20 animate-pulse rounded bg-muted" />
              <div className="h-10 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2">
            <div className="relative aspect-square bg-muted sm:aspect-auto sm:min-h-[420px]">
              {gallery[0] && (
                <Image src={gallery[0]} alt={loc("title")} fill sizes="(min-width: 640px) 384px, 100vw" className="object-cover" />
              )}
              {gallery.length > 1 && (
                <div className="absolute bottom-3 left-3 flex gap-1.5">
                  {gallery.slice(0, 4).map((src, i) => (
                    <span key={src} className={cn("h-1.5 w-1.5 rounded-full", i === 0 ? "bg-white" : "bg-white/45")} />
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col p-6">
              <p className="manifest-line">{product.vendor || "GlobalTrade"}</p>
              <h2 className="mt-2 text-xl leading-snug">{loc("title")}</h2>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5" weight="fill" />
                  {(product.rating ?? 4.8).toFixed(1)}
                  <span>({product.review_count ?? 0})</span>
                </span>
                {product.type === "physical" && typeof product.stock === "number" && (
                  <span className="inline-flex items-center gap-1">
                    <Truck className="h-3.5 w-3.5" />
                    {t("home.preview.in_stock")} {product.stock}
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-display text-2xl font-medium tabular-nums">{format(price)}</span>
                {compareAt > price && (
                  <span className="text-[13px] text-muted-foreground line-through tabular-nums">{format(compareAt)}</span>
                )}
              </div>

              <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">
                {loc("description")}
              </p>

              {highlights.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {highlights.slice(0, 2).map((h) => (
                    <li key={h} className="flex items-start gap-1.5 text-[12.5px]">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="line-clamp-1">{h}</span>
                    </li>
                  ))}
                </ul>
              )}

              {variants.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-[12px] text-muted-foreground">{t("product.variants")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {variants.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setSelected(selected?.id === v.id ? null : v)}
                        className={cn(
                          "rounded-md border px-2.5 py-1.5 text-[12px] transition-colors",
                          selected?.id === v.id
                            ? "border-primary bg-primary-soft font-medium text-primary"
                            : "border-border text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {v.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-auto pt-5">
                <Button
                  size="lg"
                  className="w-full"
                  onClick={handleAdd}
                  disabled={added || (variants.length > 0 && !selected)}
                >
                  {added ? <Check className="mr-1 h-4 w-4" weight="bold" /> : <ShoppingCart className="mr-1 h-4 w-4" />}
                  {added
                    ? t("product.add_to_cart_success")
                    : variants.length > 0 && !selected
                      ? t("quick.pick_variant")
                      : t("product.add_to_cart")}
                </Button>
                <div className="mt-2.5 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {t("product.refund_7day")}
                  </span>
                  <Button asChild variant="link" size="sm" className="h-auto p-0 text-[12.5px]" onClick={() => onOpenChange(false)}>
                    <Link href={`/products/${product.id}`}>
                      {t("quick.full_details")}
                      <ArrowRight className="ml-0.5 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}