"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  PlayCircle,
  ShieldCheck,
  CreditCard,
  Globe2,
  Lock,
  Briefcase,
  Monitor,
  Lightbulb,
  Truck,
  Package,
  ChevronRight,
} from "lucide-react";
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
}

const TERMINAL_LINES = [
  { prompt: "$", text: "fj.connect --region=global", out: "✓ 50 nodes online" },
  { prompt: "$", text: "fj.list --type=consulting", out: "8 experts available" },
  { prompt: "$", text: "fj.list --type=digital", out: "7 assets ready" },
  { prompt: "$", text: "fj.pay --method=paypal", out: "✓ SSL · Buyer Protection" },
];

const BRAND_KEY_FEATURES = [
  { icon: "globe", size: "lg" },
  { icon: "lightbulb", size: "lg" },
  { icon: "truck", size: "lg" },
];

export function TechHome() {
  const { t, locale } = useI18n();
  const { format: formatPrice } = useCurrency();
  const [featured, setFeatured] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/products?limit=4")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setFeatured((j.data || []).slice(0, 4));
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  function localized(p: Product, field: "title" | "description"): string {
    const rec = p as unknown as Record<string, string | null>;
    if (locale === "zh") return rec[field] || "";
    return rec[`${field}_${locale}`] || rec[`${field}_en`] || rec[field] || "";
  }

  return (
    <>
      {/* ══════════════════════════════════════════════
          HERO — Glass + Blobs + Terminal Card
         ══════════════════════════════════════════════ */}
      <section className="relative overflow-hidden pt-12 pb-20 sm:pt-16 sm:pb-28">
        {/* Background */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(180deg, oklch(0.97 0.015 255) 0%, oklch(0.985 0.005 260) 100%)" }}
        />
        <div className="absolute top-0 -left-20 h-[400px] w-[400px] blob-primary animate-blob pointer-events-none" />
        <div className="absolute top-20 right-0 h-[500px] w-[500px] blob-emerald animate-blob pointer-events-none" style={{ animationDelay: "6s" }} />
        <div className="absolute bottom-0 left-1/3 h-[350px] w-[350px] blob-indigo animate-blob pointer-events-none" style={{ animationDelay: "12s" }} />
        <div className="absolute inset-0 bg-grid-tech mask-fade-b pointer-events-none opacity-60" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-12 gap-12 items-center">
            {/* Left: Text */}
            <div className="lg:col-span-7">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/60 backdrop-blur-md px-3 py-1.5 mb-7 shadow-soft"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                </span>
                <span className="font-mono text-[11px] tracking-[0.16em] text-blue-700">
                  CROSS-BORDER · DIGITAL · TRUSTED
                </span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut", delay: 0.05 }}
                className="text-balance text-4xl sm:text-5xl lg:text-[60px] font-bold tracking-tight leading-[1.08] lg:leading-[1.05]"
              >
                {t("home.hero.title")}
                <br />
                <span className="text-gradient-primary">{t("home.hero.highlight")}</span>
                <span>。</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut", delay: 0.15 }}
                className="mt-6 max-w-xl text-pretty text-[15.5px] sm:text-[16px] leading-relaxed text-muted-foreground"
              >
                {t("home.hero.subtitle")}
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut", delay: 0.25 }}
                className="mt-8 flex flex-wrap items-center gap-3"
              >
                <Button asChild size="lg" className="h-12 px-6 bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-semibold hover:from-blue-400 hover:to-indigo-400 shadow-primary-glow group">
                  <Link href="/products">
                    {t("home.hero.cta.primary")}
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 px-6 border-blue-200 bg-white/60 backdrop-blur-md hover:bg-white/90">
                  <Link href="/consulting">
                    <PlayCircle className="mr-2 h-4 w-4 text-blue-600" />
                    {t("home.hero.cta.secondary")}
                  </Link>
                </Button>
              </motion.div>

              {/* Trust line */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.4 }}
                className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] font-mono text-muted-foreground"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-blue-600" />
                  {t("home.trust.ssl")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-blue-600" />
                  {t("home.trust.payment")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  {t("home.trust.buyer_protection")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Globe2 className="h-3.5 w-3.5 text-blue-600" />
                  {t("home.trust.countries")}
                </span>
              </motion.div>
            </div>

            {/* Right: Terminal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.3 }}
              className="lg:col-span-5"
            >
              <div className="relative">
                <div className="relative rounded-2xl glass-strong border-glass p-5 shadow-primary-glow corner-brackets overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/60 to-transparent animate-data-stream" />
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-blue-100">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                      <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                      <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    </div>
                    <div className="font-mono text-[10.5px] text-muted-foreground">
                      globaltrade@edge-01: ~/console
                    </div>
                  </div>
                  <div className="font-mono text-[12.5px] leading-relaxed space-y-2.5 min-h-[230px]">
                    {TERMINAL_LINES.map((line, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: 0.6 + i * 0.25 }}
                        className="space-y-0.5"
                      >
                        <div className="flex gap-2">
                          <span className="text-emerald-600">{line.prompt}</span>
                          <span className="text-blue-700">{line.text}</span>
                        </div>
                        <div className="text-muted-foreground pl-4">
                          → <span className="text-foreground/70">{line.out}</span>
                        </div>
                      </motion.div>
                    ))}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 1, 0] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 1.8 }}
                      className="flex gap-2"
                    >
                      <span className="text-emerald-600">$</span>
                      <span className="w-2 h-4 bg-blue-500 inline-block" />
                    </motion.div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Stats Strip */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.6 }}
            className="mt-20 lg:mt-24 grid grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {[
              { label: t("home.stats.active_users"), value: "1,000+" },
              { label: t("home.stats.quality_products"), value: "500+" },
              { label: t("home.stats.categories"), value: "50+" },
              { label: t("home.stats.countries"), value: "50+" },
            ].map((stat, i) => (
              <div key={stat.label} className="glass border-glass rounded-xl px-6 py-6 hover-lift relative group">
                <div className="absolute top-2 left-3 font-mono text-[9px] text-blue-400/60 tracking-wider">
                  {String(i + 1).padStart(2, "0")} /
                </div>
                <div className="text-3xl sm:text-4xl font-bold tracking-tight font-mono text-gradient-primary">
                  {stat.value}
                </div>
                <div className="mt-1.5 text-[11.5px] font-mono text-muted-foreground tracking-wider uppercase">
                  {stat.label}
                </div>
                <div className="mt-3 h-0.5 bg-slate-200/60 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: "100%" }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.2, delay: 0.8 + i * 0.1, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-blue-400 to-indigo-400"
                  />
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          PARTNER MARQUEE
         ══════════════════════════════════════════════ */}
      <section className="relative py-10 overflow-hidden border-y border-blue-100/60">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-50/40 to-transparent" />
        <div className="flex items-center gap-2 absolute top-2 left-4 font-mono text-[10px] text-muted-foreground">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          {t("home.partners.label")}
        </div>
        <div className="flex mask-fade-edges">
          <div className="flex animate-marquee gap-16 items-center py-4">
            {Array.from({ length: 16 }).map((_, i) => (
              <div
                key={i}
                className="flex h-12 w-28 items-center justify-center rounded-lg border border-blue-200/40 bg-white/50 text-xs font-mono text-muted-foreground tracking-widest glass"
              >
                {t("home.partners.item")} {i + 1}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          VALUE PROPOSITION — Glass Cards
         ══════════════════════════════════════════════ */}
      <section className="relative px-4 py-20 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute top-0 right-0 h-[300px] w-[300px] blob-primary animate-blob pointer-events-none opacity-30" style={{ animationDelay: "-3s" }} />
        
        <div className="relative mx-auto max-w-7xl">
          <div className="grid items-center gap-16 md:grid-cols-2">
            {/* Image side with glass overlay */}
            <div className="relative aspect-square overflow-hidden rounded-2xl glass-strong border-glass">
              <div className="absolute inset-0 bg-grid-fine opacity-50" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-6">
                  <div className="flex h-24 w-24 items-center justify-center rounded-3xl glass-strong border-glass shadow-soft">
                    <Truck className="h-12 w-12 text-blue-600" />
                  </div>
                  <div className="glass rounded-xl px-6 py-3">
                    <span className="font-mono text-[11px] text-blue-600">{t("home.logistics.label")}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Text side */}
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/60 backdrop-blur-md px-3 py-1.5 mb-6 shadow-soft">
                <span className="font-mono text-[10px] tracking-[0.16em] text-blue-700 uppercase">
                  {t("nav.products")}
                </span>
              </div>
              <h2 className="mb-6 text-2xl font-semibold md:text-3xl">
                {t("home.value.title")}
              </h2>
              <p className="mb-8 text-base leading-relaxed text-muted-foreground">
                {t("home.value.subtitle")}
              </p>
              <ul className="space-y-6">
                {[
                  { Icon: Monitor, title: t("home.value.item1.title"), desc: t("home.value.item1.desc") },
                  { Icon: Lightbulb, title: t("home.value.item2.title"), desc: t("home.value.item2.desc") },
                  { Icon: Truck, title: t("home.value.item3.title"), desc: t("home.value.item3.desc") },
                ].map((item) => (
                  <li key={item.title} className="flex gap-4 group">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl glass border-glass shadow-soft group-hover:shadow-primary-glow transition-all">
                      <item.Icon className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold">{item.title}</h4>
                      <p className="text-sm text-muted-foreground">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          BENTO CATEGORIES — Glass Style
         ══════════════════════════════════════════════ */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="mb-2 text-2xl font-semibold md:text-3xl">
              {t("home.cat.title")}
            </h2>
            <p className="text-base text-muted-foreground">{t("home.cat.subtitle")}</p>
          </div>
        </div>

        <div className="grid h-auto grid-cols-1 gap-6 md:min-h-[480px] md:grid-cols-4 md:grid-rows-2">
          {/* Large: Consumer Electronics */}
          <Link
            href="/products/electronics"
            className="group relative cursor-pointer overflow-hidden rounded-2xl md:col-span-2 md:row-span-2 glass-strong border-glass hover:shadow-primary-glow transition-all"
          >
            <div className="absolute inset-0 bg-grid-fine opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-indigo-500/5" />
            <div className="absolute inset-0 flex items-end p-8">
              <div className="relative z-10">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl glass-strong border-glass">
                  <Monitor className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="mb-2 text-xl font-semibold md:text-2xl">
                  {t("home.cat.electronics.title")}
                </h3>
                <p className="mb-4 max-w-md text-sm text-muted-foreground">
                  {t("home.cat.electronics.desc")}
                </p>
                <span className="text-2xl text-blue-600 transition-transform group-hover:translate-x-1 inline-block">
                  →
                </span>
              </div>
            </div>
          </Link>

          {/* Industrial Hardware */}
          <Link
            href="/products/physical"
            className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl glass border-glass p-8 hover:shadow-primary-glow transition-all md:col-span-2"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="mb-2 text-lg font-semibold">
                  {t("home.cat.industrial.title")}
                </h3>
                <p className="max-w-md text-sm text-muted-foreground">
                  {t("home.cat.industrial.desc")}
                </p>
              </div>
              <Package className="h-8 w-8 text-blue-600" />
            </div>
            <div className="flex justify-end">
              <div className="rounded-full bg-white p-3 shadow-sm transition-all group-hover:bg-blue-600 group-hover:text-white group-hover:shadow-primary-glow">
                <ArrowRight className="h-4 w-4" />
              </div>
            </div>
          </Link>

          {/* Consulting */}
          <Link
            href="/consulting"
            className="group flex cursor-pointer flex-col justify-between rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 p-6 text-white transition-all hover:shadow-primary-glow"
          >
            <Briefcase className="h-7 w-7" />
            <div>
              <h4 className="text-base font-semibold">{t("home.cat.consulting.title")}</h4>
              <p className="text-sm text-white/70">{t("home.cat.consulting.desc")}</p>
            </div>
          </Link>

          {/* Digital Goods */}
          <Link
            href="/digital-goods"
            className="group flex cursor-pointer flex-col justify-between rounded-2xl glass border-glass p-6 transition-all hover:shadow-primary-glow"
          >
            <Package className="h-7 w-7 text-blue-600" />
            <div>
              <h4 className="text-base font-semibold">{t("home.cat.digital.title")}</h4>
              <p className="text-sm text-muted-foreground">{t("home.cat.digital.desc")}</p>
            </div>
          </Link>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          FEATURED PRODUCTS — Real API Data
         ══════════════════════════════════════════════ */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 relative">
        <div className="absolute -left-40 top-0 h-[400px] w-[400px] blob-emerald animate-blob pointer-events-none opacity-20" style={{ animationDelay: "-8s" }} />
        
        <div className="relative mb-14 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/60 backdrop-blur-md px-3 py-1.5 mb-6 shadow-soft">
            <span className="font-mono text-[10px] tracking-[0.16em] text-blue-700 uppercase">
              {t("home.featured.marketplace")}
            </span>
          </div>
          <h2 className="mb-3 text-2xl font-semibold md:text-3xl">
            {t("home.featured.title")}
          </h2>
          <p className="text-base text-muted-foreground">{t("home.featured.subtitle")}</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="glass border-glass rounded-2xl p-5 space-y-4 animate-pulse">
                <div className="aspect-[4/3] rounded-xl bg-slate-200/60" />
                <div className="h-4 w-3/4 rounded bg-slate-200/60" />
                <div className="h-3 w-1/2 rounded bg-slate-100/60" />
              </div>
            ))}
          </div>
        ) : featured.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{t("home.featured.empty")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((product) => (
              <Link
                key={product.id}
                href={`/products/${product.id}`}
                className="group cursor-pointer"
              >
                <div className="relative mb-4 aspect-[4/3] overflow-hidden rounded-2xl glass-strong border-glass group-hover:shadow-primary-glow transition-all">
                  <div className="absolute inset-0 bg-grid-fine opacity-30" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl glass-strong border-glass shadow-soft">
                      {product.type === "service" ? (
                        <Briefcase className="h-8 w-8 text-indigo-600" />
                      ) : (
                        <Package className="h-8 w-8 text-blue-600" />
                      )}
                    </div>
                  </div>
                  <span className={cn(
                    "absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-bold text-white",
                    product.type === "service" ? "bg-indigo-500" : "bg-blue-600"
                  )}>
                    {product.type === "service"
                      ? t("home.featured.type_service")
                      : t("home.featured.type_product")}
                  </span>
                </div>
                <h4 className="font-semibold transition-colors group-hover:text-blue-600 line-clamp-1">
                  {localized(product, "title")}
                </h4>
                <p className="mb-2 line-clamp-1 text-sm text-muted-foreground">
                  {localized(product, "description")}
                </p>
                <p className="text-sm font-semibold text-blue-600">
                  {t("home.featured.from")} {formatPrice(parseFloat(product.price))}
                </p>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-10 text-center">
          <Button asChild variant="link" className="text-blue-600">
            <Link href="/products" className="inline-flex items-center gap-2">
              {t("home.featured.view_all")} <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          CTA SECTION
         ══════════════════════════════════════════════ */}
      <section className="relative mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl glass-strong border-glass p-12 sm:p-16 shadow-primary-glow">
          <div className="absolute top-0 -right-20 h-[300px] w-[300px] blob-indigo animate-blob pointer-events-none opacity-50" />
          <div className="absolute -bottom-20 -left-20 h-[250px] w-[250px] blob-primary animate-blob pointer-events-none opacity-40" style={{ animationDelay: "-5s" }} />
          
          <div className="relative text-center max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">
              {t("home.cta.title")}
            </h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              {t("home.cta.subtitle")}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button asChild size="lg" className="h-12 px-8 bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-semibold hover:from-blue-400 hover:to-indigo-400 shadow-primary-glow">
                <Link href="/auth/register">
                  {t("nav.register")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-8 border-blue-200 bg-white/60 backdrop-blur-md">
                <a href="mailto:support@globaltrade-hub.com">
                  {t("footer.contact")}
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
