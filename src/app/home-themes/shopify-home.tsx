"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight, Star, CaretRight, CreditCard, Lock,
  Briefcase, FileText, Check, ArrowCounterClockwise, Truck, Package,
} from "@phosphor-icons/react";
import { useI18n } from "@/contexts/i18n-context";
import { useCurrency } from "@/contexts/currency-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Eye } from "@phosphor-icons/react";
import { CountUp } from "@/components/motion";
import { QuickView } from "@/components/quick-view";
import { Reveal } from "@/components/reveal";

interface Product {
  id: string;
  title: string;
  title_en: string | null;
  title_pt: string | null;
  description: string | null;
  description_en: string | null;
  description_pt: string | null;
  price: string;
  type: string;
  image_key: string | null;
  rating?: number;
  review_count?: number;
  sold_count?: number;
  stock?: number;
  vendor?: string;
  compare_at_price?: string | null;
}

/** 提单号：由商品 id 派生，稳定且看起来像真实单据 */
function manifestRef(id: string) {
  const n = id.replace(/\D/g, "").padStart(4, "0");
  return `GT-${n}-26`;
}

export function ShopifyHome() {
  const { t, locale } = useI18n();
  const { format: formatPrice } = useCurrency();
  const [featured, setFeatured] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [quickId, setQuickId] = useState<string | null>(null);

  const loadFeatured = useCallback(() => {
    setLoading(true);
    setFailed(false);
    fetch("/api/products?limit=8&sort=featured")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((j) => {
        if (j.error) throw new Error(j.error);
        setFeatured((j.data || []).slice(0, 8));
        setCatalogTotal(Number(j.total ?? (j.data || []).length));
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadFeatured(); }, [loadFeatured]);

  function localized(p: Product, field: "title" | "description"): string {
    const rec = p as unknown as Record<string, string | null>;
    if (locale === "zh") return rec[field] || "";
    return rec[`${field}_${locale}`] || rec[`${field}_en`] || rec[field] || "";
  }

  const physical = featured.filter((p) => p.type === "physical").slice(0, 3);
  const gridItems = featured.slice(0, 6);

  return (
    <div className="bg-background text-foreground">
      {/* ══════════ HERO — port scene, headline on calm sky ══════════ */}
      <section className="relative isolate overflow-hidden border-b border-border">
        <Image
          src="/images/catalog/cargo-ship-3.jpg"
          alt={t("home.hero.scene_alt")}
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        {/* 单色压暗，保证文字对比；不引入色相渐变 */}
        <div className="absolute inset-0 bg-[#0b0e12]/62" aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 h-2/3 bg-[#0b0e12]/35" aria-hidden="true" />

        <div className="relative mx-auto flex min-h-[640px] max-w-7xl flex-col px-4 pt-16 sm:px-6 lg:min-h-[720px] lg:px-8">
          <div className="max-w-2xl">
            <p className="manifest-line text-white/70">{t("home.hero.route")}</p>
            <h1 className="mt-4 text-balance text-4xl leading-[1.1] text-white sm:text-5xl lg:text-[52px]">
              {t("home.hero.title")}
              {t("home.hero.highlight")}
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-[15px] leading-relaxed text-white/80">
              {t("home.hero.subtitle")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-white text-[#14181d] hover:bg-white/90">
                <Link href="/products">
                  {t("home.hero.cta.primary")}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/35 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/consulting">{t("home.hero.cta.secondary")}</Link>
              </Button>
            </div>
          </div>

          {/* 产品预览：真实在架货品与运费事实，从底边升起 */}
          <div className="mt-auto pb-10 pt-16">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-pop">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-6 py-4">
                <div className="flex items-center gap-3">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  <span className="text-[13px] font-medium">{t("home.preview.title")}</span>
                </div>
                <span className="manifest-line">{t("home.preview.updated")}</span>
              </div>

              {loading ? (
                <div className="divide-y divide-border-subtle">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4 px-6 py-4">
                      <div className="h-12 w-12 shrink-0 animate-pulse rounded-md bg-muted" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : physical.length > 0 ? (
                <div className="divide-y divide-border-subtle">
                  {physical.map((p) => (
                    <Link
                      key={p.id}
                      href={`/products/${p.id}`}
                      className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted"
                    >
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                        {p.image_key && (
                          <Image src={p.image_key} alt={localized(p, "title")} fill sizes="48px" className="object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">{localized(p, "title")}</p>
                        <p className="manifest-line mt-1">
                          {manifestRef(p.id)} · {p.vendor || "GlobalTrade"} · {t("home.preview.in_stock")} {p.stock ?? 0}
                        </p>
                      </div>
                      <div className="hidden shrink-0 text-right sm:block">
                        <p className="text-[13px] font-medium tabular-nums">{formatPrice(Number(p.price))}</p>
                        <p className="manifest-line mt-1">{t("home.preview.free_over")} $300</p>
                      </div>
                      <CaretRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-8 text-center text-[13px] text-muted-foreground">
                  {t("home.featured.empty")}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ Shipping facts — the product's own numbers ══════════ */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <dl className="grid grid-cols-2 divide-border-subtle sm:grid-cols-4 sm:divide-x">
            {[
              { label: t("home.facts.zones"), value: "4", note: t("home.facts.zones_note") },
              { label: t("home.facts.catalog"), value: catalogTotal ? String(catalogTotal) : "—", note: t("home.facts.catalog_note") },
              { label: t("home.facts.dispatch"), value: "48h", note: t("home.facts.dispatch_note") },
              { label: t("home.facts.refund"), value: "7", note: t("home.facts.refund_note") },
            ].map((f) => (
              <div key={f.label} className="px-0 py-8 sm:px-8 sm:first:pl-0 sm:last:pr-0">
                <dt className="text-[13px] text-muted-foreground">{f.label}</dt>
                <dd className="mt-2 text-3xl tabular-nums">
                  {/^\d+$/.test(f.value) ? <CountUp value={Number(f.value)} /> : f.value}
                </dd>
                <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{f.note}</p>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ══════════ What we sell — asymmetric, not three equal cards ══════════ */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="text-2xl sm:text-[28px]">{t("home.cat.title")}</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{t("home.cat.subtitle")}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/products">
              {t("home.featured.view_all")}
              <CaretRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          {/* Wide: physical goods, the thing that actually ships */}
          <Link
            href="/products?type=physical"
            className="group relative overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:bg-muted lg:col-span-7"
          >
            <div className="relative aspect-[16/10] overflow-hidden sm:aspect-[16/9]">
              <Image
                src="/images/catalog/warehouse-logistics-2.jpg"
                alt={t("home.collections.physical_alt")}
                fill
                sizes="(min-width: 1024px) 58vw, 100vw"
                className="object-cover"
              />
            </div>
            <div className="flex items-start justify-between gap-4 p-6">
              <div>
                <h3 className="text-lg">{t("home.collections.physical")}</h3>
                <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
                  {t("home.collections.physical_desc")}
                </p>
                <p className="manifest-line mt-3">{t("home.collections.physical_meta")}</p>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
          </Link>

          {/* Narrow column: two compact entries */}
          <div className="grid gap-4 lg:col-span-5">
            {[
              { href: "/products?type=service", Icon: Briefcase, title: t("home.collections.consulting.title"), desc: t("home.collections.consulting.desc"), meta: t("home.collections.consulting_meta") },
              { href: "/products?type=virtual", Icon: FileText, title: t("home.collections.templates.title"), desc: t("home.collections.templates.desc"), meta: t("home.collections.templates_meta") },
            ].map(({ href, Icon, title, desc, meta }) => (
              <Link
                key={title}
                href={href}
                className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-6 transition-colors hover:bg-muted"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-[15px]">{title}</h3>
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground line-clamp-2">{desc}</p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <p className="manifest-line mt-4">{meta}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ Catalogue — real photos carry the colour ══════════ */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-[28px]">{t("home.featured.title")}</h2>
              <p className="mt-2 text-[14px] text-muted-foreground">{t("home.featured.subtitle")}</p>
            </div>
            <Link href="/products" className="text-[13px] font-medium text-primary hover:underline">
              {t("home.featured.view_all")}
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="space-y-3">
                  <div className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
                  <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : failed ? (
            <div className="rounded-2xl border border-border py-14 text-center">
              <p className="text-[13px] text-muted-foreground">{t("home.featured.load_failed")}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={loadFeatured}>
                <ArrowCounterClockwise className="h-4 w-4" />
                {t("common.retry")}
              </Button>
            </div>
          ) : gridItems.length === 0 ? (
            <p className="py-12 text-center text-[13px] text-muted-foreground">{t("home.featured.empty")}</p>
          ) : (
            <Reveal className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-3">
              {gridItems.map((product) => {
                const rating = product.rating ?? 4.8;
                const compareAt = product.compare_at_price ? Number(product.compare_at_price) : 0;
                const price = Number(product.price);
                return (
                  <article key={product.id} className="group relative">
                    <Link href={`/products/${product.id}`} className="absolute inset-0 z-10" aria-label={localized(product, "title")} />
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted">
                      {product.image_key ? (
                        <Image
                          src={product.image_key}
                          alt={localized(product, "title")}
                          fill
                          sizes="(min-width: 1024px) 30vw, 50vw"
                          className="object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                          <Package className="h-6 w-6" />
                        </div>
                      )}
                      <button
                        onClick={() => setQuickId(product.id)}
                        aria-label={t("quick.view")}
                        className="absolute right-2 top-2 z-20 flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card/95 text-muted-foreground opacity-0 shadow-card transition-[opacity,color] duration-200 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-[14px] leading-snug transition-colors group-hover:text-primary line-clamp-2">
                          {localized(product, "title")}
                        </h3>
                        <span className="shrink-0 text-[14px] tabular-nums">{formatPrice(price)}</span>
                      </div>
                      <p className="manifest-line mt-2 flex flex-wrap items-center gap-x-2">
                        <span>{manifestRef(product.id)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1">
                          <Star className="h-3 w-3" weight="fill" />
                          {rating.toFixed(1)}
                        </span>
                        {compareAt > price && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="line-through">{formatPrice(compareAt)}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </article>
                );
              })}
            </Reveal>
          )}
        </div>
      </section>

      {/* ══════════ How fulfilment works — facts, not decoration ══════════ */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <h2 className="text-2xl sm:text-[28px]">{t("home.fulfilment.title")}</h2>
              <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">
                {t("home.fulfilment.desc")}
              </p>
              <div className="mt-6 flex items-center gap-4 border-t border-border pt-6 text-[13px] text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  {t("home.trust.ssl")}
                </span>
                <span className="inline-flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  {t("home.trust.payment")}
                </span>
              </div>
              <Button asChild variant="outline" className="mt-6">
                <Link href="/products?type=physical">
                  {t("home.fulfilment.cta")}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>

            {/* Zone table: one accent on the row that matters */}
            <div className="lg:col-span-7">
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-6 py-3 text-left font-medium text-muted-foreground">{t("home.fulfilment.zone")}</th>
                      <th className="px-6 py-3 text-right font-medium text-muted-foreground">{t("home.fulfilment.rate")}</th>
                      <th className="px-6 py-3 text-right font-medium text-muted-foreground">{t("home.fulfilment.free")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {[
                      { name: t("home.fulfilment.apac"), rate: "$18.00", free: "$300.00", lead: true },
                      { name: t("home.fulfilment.na"), rate: "$28.00", free: "$450.00" },
                      { name: t("home.fulfilment.eu"), rate: "$32.00", free: "$500.00" },
                      { name: t("home.fulfilment.latam"), rate: "$36.00", free: "$600.00" },
                    ].map((z) => (
                      <tr key={z.name} className={cn(z.lead && "bg-primary-soft")}>
                        <td className="px-6 py-4">
                          <span className={cn("font-medium", z.lead && "text-primary")}>{z.name}</span>
                          {z.lead && <span className="manifest-line ml-2">{t("home.fulfilment.fastest")}</span>}
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums">{z.rate}</td>
                        <td className="px-6 py-4 text-right tabular-nums text-muted-foreground">{z.free}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="manifest-line mt-3">{t("home.fulfilment.note")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ Advisory — one concrete offer ══════════ */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-6">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border">
                <Image
                  src="/images/catalog/business-meeting-1.jpg"
                  alt={t("home.featured_consulting.title")}
                  fill
                  sizes="(min-width: 1024px) 46vw, 100vw"
                  className="object-cover"
                />
              </div>
            </div>
            <div className="lg:col-span-6">
              <p className="manifest-line">{t("home.featured_consulting.session")}</p>
              <h2 className="mt-3 text-2xl sm:text-[28px]">{t("home.featured_consulting.title")}</h2>
              <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">
                {t("home.featured_consulting.desc")}
              </p>
              <ul className="mt-6 space-y-3 text-[13.5px]">
                {[t("home.featured_consulting.feat1"), t("home.featured_consulting.feat2")].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Button asChild size="lg">
                  <Link href="/consulting">{t("home.featured_consulting.btn")}</Link>
                </Button>
                <span className="text-[13px] text-muted-foreground">
                  {t("home.advisory.from")} <span className="tabular-nums text-foreground">$299.00</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <QuickView productId={quickId} open={!!quickId} onOpenChange={(v) => { if (!v) setQuickId(null); }} />

      {/* ══════════ Contact strip ══════════ */}
      <section className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-4 py-12 sm:px-6 lg:px-8">
          <div className="max-w-lg">
            <h2 className="text-xl">{t("home.cta.title")}</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{t("home.cta.subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/contact">{t("footer.contact")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/about">{t("footer.about")}</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}