"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Star, ShoppingCart, Check, X, ArrowRight } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useI18n } from "@/contexts/i18n-context";
import { useCurrency } from "@/contexts/currency-context";
import { useCart } from "@/contexts/cart-context";
import { Button } from "@/components/ui/button";
import { BreadcrumbPublic } from "@/components/breadcrumb-public";
import { cn } from "@/lib/utils";

interface Product {
  id: string;
  title: string;
  title_en: string | null;
  description: string | null;
  description_en: string | null;
  price: string;
  type: string;
  image_key: string | null;
  rating?: number;
  review_count?: number;
  stock?: number;
  vendor?: string;
  delivery_method?: string;
  duration?: string | null;
  highlights?: string[];
  highlights_en?: string[];
  categories?: { name: string; name_en: string | null } | null;
}

const DEFAULT_PICKS = ["prod-20", "prod-21", "prod-22"];

export default function ComparePage() {
  const { t, locale } = useI18n();
  const { format } = useCurrency();
  const { addItem } = useCart();
  const [all, setAll] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<string[]>(DEFAULT_PICKS);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((j) => setAll(j.data || []))
      .catch(() => setAll([]))
      .finally(() => setLoading(false));
  }, []);

  const loc = (p: Product, field: "title" | "description") => {
    const rec = p as unknown as Record<string, string | null>;
    if (locale === "zh") return rec[field] || "";
    return rec[`${field}_${locale}`] || rec[`${field}_en`] || rec[field] || "";
  };

  const selected = useMemo(
    () => picked.map((id) => all.find((p) => p.id === id)).filter(Boolean) as Product[],
    [picked, all]
  );

  const toggle = (id: string) => {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id]
    );
  };

  const deliveryLabel = (m?: string) =>
    m === "shipping" ? t("product.shipping") : m === "download" ? t("product.download") : m === "email" ? t("product.email") : t("product.online");

  const rows: { key: string; label: string; render: (p: Product) => React.ReactNode }[] = [
    { key: "price", label: t("compare.price"), render: (p) => <span className="font-mono text-lg font-medium">{format(Number(p.price))}</span> },
    { key: "rating", label: t("compare.rating"), render: (p) => (
      <span className="inline-flex items-center gap-1">
        <Star className="h-3.5 w-3.5 text-amber-500" weight="fill" />
        <span className="font-medium">{(p.rating ?? 4.8).toFixed(1)}</span>
        <span className="text-xs text-muted-foreground">({p.review_count ?? 0})</span>
      </span>
    ) },
    { key: "vendor", label: t("compare.vendor"), render: (p) => p.vendor || "—" },
    { key: "category", label: t("home.cat.title"), render: (p) => (locale === "zh" ? p.categories?.name : p.categories?.name_en || p.categories?.name) || "—" },
    { key: "delivery", label: t("compare.delivery"), render: (p) => deliveryLabel(p.delivery_method) },
    { key: "duration", label: t("product.duration"), render: (p) => p.duration || "—" },
    { key: "stock", label: t("compare.stock"), render: (p) => p.type === "physical" ? (p.stock ?? 0) : "∞" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <BreadcrumbPublic items={[{ label: t("crumb.products"), href: "/products" }, { label: t("compare.title") }]} />

      <div className="mb-8 max-w-2xl">
        <h1 className="font-display text-3xl font-medium sm:text-4xl">{t("compare.title")}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{t("compare.subtitle")}</p>
      </div>

      {/* Picker */}
      <div className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-card">
        <p className="mb-3 text-[11px] font-medium text-muted-foreground">
          {t("compare.pick")}
        </p>
        {loading ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-8 w-28 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {all.map((p) => {
              const on = picked.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={cn("inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12.5px] font-medium transition-colors duration-200",
                    on ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {on ? <Check className="h-3.5 w-3.5" weight="bold" /> : null}
                  <span className="max-w-[180px] truncate">{loc(p, "title")}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected.length < 2 ? (
        <div className="rounded-3xl border border-border bg-card py-20 text-center shadow-card">
          <p className="text-sm text-muted-foreground">{t("compare.empty")}</p>
          <Button asChild variant="outline" className="mt-5">
            <Link href="/products">
              {t("home.hero.cta.primary")}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-border bg-card shadow-card">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-32 border-b border-border p-4 text-left align-bottom text-[11px] font-medium text-muted-foreground">
                  {t("compare.spec")}
                </th>
                {selected.map((p) => (
                  <th key={p.id} className="border-b border-l border-border p-4 align-top">
                    <div className="group">
                      <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-xl border border-border">
                        {p.image_key ? (
                          <Image src={p.image_key} alt={loc(p, "title")} fill sizes="240px" className="object-cover" />
                        ) : (
                          <div className="absolute inset-0 bg-muted" />
                        )}
                        <button
                          onClick={() => toggle(p.id)}
                          aria-label={t("cart.remove")}
                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-card/90 text-muted-foreground shadow-card backdrop-blur-md transition-colors hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <Link
                        href={`/products/${p.id}`}
                        className="block text-left font-display text-[14px] font-medium leading-snug transition-colors hover:text-primary line-clamp-2"
                      >
                        {loc(p, "title")}
                      </Link>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="transition-colors hover:bg-muted/40">
                  <td className="border-b border-border-subtle p-4 text-[12.5px] font-medium text-muted-foreground">
                    {row.label}
                  </td>
                  {selected.map((p) => (
                    <td key={p.id} className="border-b border-l border-border-subtle p-4 align-middle">
                      {row.render(p)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="p-4 align-top text-[12.5px] font-medium text-muted-foreground">
                  {t("product.recommendations")}
                </td>
                {selected.map((p) => {
                  const list = (locale === "zh" ? p.highlights : p.highlights_en || p.highlights) ?? [];
                  return (
                    <td key={p.id} className="border-l border-border-subtle p-4 align-top">
                      <ul className="space-y-2">
                        {list.slice(0, 3).map((h) => (
                          <li key={h} className="flex gap-2 text-[12.5px] leading-relaxed">
                            <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600" weight="bold" />
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="p-4" />
                {selected.map((p) => (
                  <td key={p.id} className="border-l border-border-subtle p-4">
                    <div className="flex flex-col gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          addItem({ id: p.id, title: loc(p, "title"), price: Number(p.price), type: p.type });
                          toast.success(t("product.add_to_cart_success"));
                        }}
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                        {t("compare.add")}
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/products/${p.id}`}>{t("compare.view")}</Link>
                      </Button>
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}