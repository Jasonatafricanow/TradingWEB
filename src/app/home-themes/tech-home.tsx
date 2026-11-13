"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight, CaretRight, ShieldCheck, CreditCard, Lock, Globe,
  Briefcase, FileText, Truck, ArrowCounterClockwise, Star, Check,
} from "@phosphor-icons/react";
import { useI18n } from "@/contexts/i18n-context";
import { useCurrency } from "@/contexts/currency-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  stock?: number;
  vendor?: string;
  sold_count?: number;
  compare_at_price?: string | null;
}

function manifestRef(id: string) {
  const n = id.replace(/\D/g, "").padStart(4, "0");
  return `GT-${n}-26`;
}

const TYPE_LABEL: Record<string, string> = {
  physical: "product.type.physical",
  service: "product.type.service",
  virtual: "product.type.virtual",
};

export function TechHome() {
  const { t, locale } = useI18n();
  const { format: formatPrice } = useCurrency();
  const [featured, setFeatured] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

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

  const ledger = featured.slice(0, 6);
  const spotlight = featured.find((p) => p.type === "physical") ?? featured[0];

  return (
    <div className="bg-background text-foreground">
      {/* ══════════ HERO — asymmetric split, real cargo visual ══════════ */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:gap-16 lg:px-8">
          <div className="lg:col-span-6">
            <p className="manifest-line">{t("home.hero.route")}</p>
            <h1 className="mt-4 text-balance text-4xl leading-[1.1] sm:text-5xl">
              {t("home.hero.title")}
              {t("home.hero.highlight")}
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground">
              {t("home.hero.subtitle")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/products">
                  {t("home.hero.cta.primary")}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/consulting">{t("home.hero.cta.secondary")}</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-6 text-[13px] text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Lock className="h-4 w-4" />
                {t("home.trust.ssl")}
              </span>
              <span className="inline-flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                {t("home.trust.payment")}
              </span>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                {t("home.trust.buyer_protection")}
              </span>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border">
              <Image
                src="/images/catalog/cargo-ship-1.jpg"
                alt={t("home.hero.scene_alt")}
                fill
                priority
                sizes="(min-width: 1024px) 46vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ Stock ledger — real rows, mono references ══════════ */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-[28px]">{t("home.preview.title")}</h2>
              <p className="mt-2 text-[14px] text-muted-foreground">{t("home.preview.updated")}</p>
            </div>
            <Link href="/products" className="text-[13px] font-medium text-primary hover:underline">
              {t("home.featured.view_all")}
            </Link>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border">
            {loading ? (
              <div className="divide-y divide-border-subtle">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4">
                    <div className="h-12 w-12 shrink-0 animate-pulse rounded-md bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-48 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : failed ? (
              <div className="py-14 text-center">
                <p className="text-[13px] text-muted-foreground">{t("home.featured.load_failed")}</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={loadFeatured}>
                  <ArrowCounterClockwise className="h-4 w-4" />
                  {t("common.retry")}
                </Button>
              </div>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="px-6 py-3 text-left font-medium text-muted-foreground">{t("home.ledger.item")}</th>
                    <th className="hidden px-6 py-3 text-left font-medium text-muted-foreground sm:table-cell">{t("home.ledger.ref")}</th>
                    <th className="hidden px-6 py-3 text-left font-medium text-muted-foreground md:table-cell">{t("home.ledger.kind")}</th>
                    <th className="px-6 py-3 text-right font-medium text-muted-foreground">{t("home.ledger.stock")}</th>
                    <th className="px-6 py-3 text-right font-medium text-muted-foreground">{t("compare.price")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {ledger.map((p, i) => (
                    <tr key={p.id} className={cn("transition-colors hover:bg-muted", i === 0 && "bg-primary-soft")}>
                      <td className="px-6 py-4">
                        <Link href={`/products/${p.id}`} className="flex items-center gap-3">
                          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                            {p.image_key && <Image src={p.image_key} alt="" fill sizes="40px" className="object-cover" />}
                          </span>
                          <span className={cn("line-clamp-1 font-medium", i === 0 && "text-primary")}>
                            {localized(p, "title")}
                          </span>
                        </Link>
                      </td>
                      <td className="hidden px-6 py-4 sm:table-cell">
                        <span className="manifest-line">{manifestRef(p.id)}</span>
                      </td>
                      <td className="hidden px-6 py-4 text-muted-foreground md:table-cell">
                        {t(TYPE_LABEL[p.type] || "product.type.virtual")}
                      </td>
                      <td className="px-6 py-4 text-right tabular-nums text-muted-foreground">
                        {p.type === "physical" ? (p.stock ?? 0) : "—"}
                      </td>
                      <td className="px-6 py-4 text-right tabular-nums">{formatPrice(Number(p.price))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      {/* ══════════ Catalogue by kind — varied widths ══════════ */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-xl">
          <h2 className="text-2xl sm:text-[28px]">{t("home.cat.title")}</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{t("home.cat.subtitle")}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          {spotlight && (
            <Link
              href={`/products/${spotlight.id}`}
              className="group overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:bg-muted lg:col-span-8"
            >
              <div className="relative aspect-[16/9] overflow-hidden">
                {spotlight.image_key && (
                  <Image
                    src={spotlight.image_key}
                    alt={localized(spotlight, "title")}
                    fill
                    sizes="(min-width: 1024px) 64vw, 100vw"
                    className="object-cover"
                  />
                )}
              </div>
              <div className="flex flex-wrap items-start justify-between gap-4 p-6">
                <div className="min-w-0">
                  <p className="manifest-line">{manifestRef(spotlight.id)} · {spotlight.vendor}</p>
                  <h3 className="mt-2 text-lg">{localized(spotlight, "title")}</h3>
                  <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-muted-foreground line-clamp-2">
                    {localized(spotlight, "description")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl tabular-nums">{formatPrice(Number(spotlight.price))}</p>
                  <p className="manifest-line mt-1 inline-flex items-center gap-1">
                    <Star className="h-3 w-3" weight="fill" />
                    {(spotlight.rating ?? 4.8).toFixed(1)}
                  </p>
                </div>
              </div>
            </Link>
          )}

          <div className="grid gap-4 lg:col-span-4">
            {[
              { href: "/products?type=service", Icon: Briefcase, title: t("home.collections.consulting.title"), meta: t("home.collections.consulting_meta") },
              { href: "/products?type=virtual", Icon: FileText, title: t("home.collections.templates.title"), meta: t("home.collections.templates_meta") },
              { href: "/products?type=physical", Icon: Truck, title: t("home.collections.physical"), meta: t("home.collections.physical_meta") },
            ].map(({ href, Icon, title, meta }) => (
              <Link
                key={title}
                href={href}
                className="group flex items-start justify-between gap-4 rounded-2xl border border-border bg-card p-6 transition-colors hover:bg-muted"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <h3 className="text-[15px]">{title}</h3>
                  </div>
                  <p className="manifest-line mt-2">{meta}</p>
                </div>
                <CaretRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ Zones — one table, one highlighted row ══════════ */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <h2 className="text-2xl sm:text-[28px]">{t("home.fulfilment.title")}</h2>
              <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">{t("home.fulfilment.desc")}</p>
              <ul className="mt-6 space-y-3 text-[13.5px]">
                {[t("home.facts.dispatch_note"), t("home.facts.refund_note")].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground">{line}</span>
                  </li>
                ))}
              </ul>
              <Button asChild variant="outline" className="mt-6">
                <Link href="/products?type=physical">
                  {t("home.fulfilment.cta")}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="lg:col-span-7">
              <div className="overflow-hidden rounded-2xl border border-border">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-muted">
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
              <Link href="/about">
                <Globe className="mr-1 h-4 w-4" />
                {t("footer.about")}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}