"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Star,
  ChevronRight,
  ShieldCheck,
  CreditCard,
  Lock,
  Globe,
  FileText,
  Briefcase,
  BookOpen,
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

// 评分和评论数模拟（对齐真实在架商品）
const PRODUCT_REVIEW_META: Record<string, { rating: number; reviews: number; badge?: string }> = {
  "prod-1": { rating: 5.0, reviews: 38, badge: "Hot Service" },
  "prod-2": { rating: 4.8, reviews: 14 },
  "prod-3": { rating: 4.9, reviews: 22, badge: "Recommended" },
  "prod-9": { rating: 4.8, reviews: 96, badge: "Best Seller" },
  "prod-10": { rating: 4.7, reviews: 45 },
  "prod-12": { rating: 4.9, reviews: 67, badge: "Masterclass" },
};

export function ShopifyHome() {
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
    <div className="bg-slate-50/30 min-h-screen text-[#0f172a] selection:bg-slate-200">
      {/* ══════════════════════════════════════════════
          HERO — Split Layout with Editorial Image & Banner
         ══════════════════════════════════════════════ */}
      <section className="relative mx-auto max-w-7xl px-4 pt-8 pb-16 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-8 items-center">
          {/* Left Hero Box: Editorial Layout */}
          <div className="lg:col-span-7 flex flex-col justify-center pr-0 lg:pr-8">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 mb-6 w-fit shadow-sm"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-slate-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-700" />
              </span>
              <span className="font-mono text-[10px] tracking-[0.18em] text-slate-600 font-bold uppercase">
                Global Commerce · Consulting · Digital Assets
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="font-serif text-4xl sm:text-5xl lg:text-[54px] font-semibold tracking-tight leading-[1.1] text-slate-900"
            >
              {t("home.hero.title")}
              <br />
              <span className="text-slate-500 italic font-normal">{t("home.hero.highlight")}</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-6 max-w-xl text-slate-500 text-[15px] sm:text-[16px] leading-relaxed"
            >
              {t("home.hero.subtitle")}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-8 flex flex-wrap gap-4"
            >
              <Button asChild size="lg" className="h-12 px-8 bg-slate-900 text-white hover:bg-slate-800 rounded-none tracking-wider uppercase text-xs font-bold transition-all shadow-md btn-shopify">
                <Link href="/products">
                  {t("home.hero.cta.primary")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-8 border-slate-300 hover:bg-slate-50 rounded-none tracking-wider uppercase text-xs font-bold transition-all bg-white text-slate-800">
                <Link href="/consulting">
                  {t("home.hero.cta.secondary")}
                </Link>
              </Button>
            </motion.div>

            {/* Trust Badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mt-10 pt-6 border-t border-slate-200/80 flex flex-wrap gap-6 text-xs text-slate-500 font-medium"
            >
              <span className="inline-flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-slate-700" />
                {t("home.trust.ssl")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 text-slate-700" />
                {t("home.trust.payment")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-slate-700" />
                {t("home.trust.buyer_protection")}
              </span>
            </motion.div>
          </div>

          {/* Right Hero Box: Editorial Promo Banner Card */}
          <div className="lg:col-span-5 flex justify-center w-full">
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className="w-full max-w-sm overflow-hidden border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow duration-300"
            >
              {/* Graphic Banner Area */}
              <div className="relative aspect-[4/3] bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-8 overflow-hidden group">
                <div className="absolute inset-0 bg-slate-900/5 group-hover:bg-slate-900/10 transition-colors z-10" />
                
                {/* Abstract Corporate Graphics */}
                <div className="relative z-20 flex flex-col items-center text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-md mb-4 text-slate-800">
                    <Globe className="h-8 w-8 stroke-1" />
                  </div>
                  <span className="text-[10px] font-mono tracking-[0.2em] text-slate-500 uppercase font-bold">Featured consulting</span>
                  <h3 className="mt-1.5 font-serif text-2xl font-semibold leading-tight text-slate-900">
                    {t("home.featured_consulting.title")}
                  </h3>
                  <span className="mt-2 text-xs font-mono font-bold text-slate-600 bg-slate-200/50 px-2 py-0.5">
                    {t("home.featured_consulting.session")}
                  </span>
                </div>
              </div>

              {/* Service details */}
              <div className="p-6">
                <p className="text-xs leading-relaxed text-slate-500">
                  {t("home.featured_consulting.desc")}
                </p>

                <div className="mt-5 space-y-2.5 text-xs text-slate-700 font-medium">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-800">✓</span> {t("home.featured_consulting.feat1")}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-800">✓</span> {t("home.featured_consulting.feat2")}
                  </div>
                </div>

                <Link href="/consulting" className="mt-6 block w-full text-center text-xs font-bold uppercase tracking-wider py-3.5 bg-slate-900 text-white hover:bg-slate-800 transition-colors btn-shopify">
                  {t("home.featured_consulting.btn")}
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          CURATED COLLECTIONS
         ══════════════════════════════════════════════ */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 border-t border-slate-200/60">
        <div className="mb-10 text-center">
          <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-slate-900">
            {t("home.cat.title")}
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-slate-500 uppercase tracking-widest">{t("home.cat.subtitle")}</p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Business Consulting */}
          <Link
            href="/products?type=service"
            className="group relative cursor-pointer overflow-hidden border border-slate-200 bg-white p-6 transition-all hover:shadow-md flex flex-col justify-between min-h-[180px]"
          >
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-mono tracking-wider text-slate-400 font-bold uppercase">{t("home.collections.collection")}</span>
                <h3 className="font-serif text-xl font-semibold text-slate-900 mt-1">
                  {t("home.collections.consulting.title")}
                </h3>
                <p className="mt-2 text-xs text-slate-500 line-clamp-2">
                  {t("home.collections.consulting.desc")}
                </p>
              </div>
              <Briefcase className="h-6 w-6 text-slate-400 stroke-1" />
            </div>
            <div className="mt-4 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-900">
              <span>{t("home.collections.consulting.btn")}</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </Link>

          {/* Digital Templates */}
          <Link
            href="/products?type=virtual"
            className="group relative cursor-pointer overflow-hidden border border-slate-200 bg-white p-6 transition-all hover:shadow-md flex flex-col justify-between min-h-[180px]"
          >
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-mono tracking-wider text-slate-400 font-bold uppercase">{t("home.collections.collection")}</span>
                <h3 className="font-serif text-xl font-semibold text-slate-900 mt-1">
                  {t("home.collections.templates.title")}
                </h3>
                <p className="mt-2 text-xs text-slate-500 line-clamp-2">
                  {t("home.collections.templates.desc")}
                </p>
              </div>
              <FileText className="h-6 w-6 text-slate-400 stroke-1" />
            </div>
            <div className="mt-4 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-900">
              <span>{t("home.collections.templates.btn")}</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </Link>

          {/* Online Courses */}
          <Link
            href="/products?type=virtual"
            className="group relative cursor-pointer overflow-hidden border border-slate-200 bg-white p-6 transition-all hover:shadow-md flex flex-col justify-between min-h-[180px]"
          >
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-mono tracking-wider text-slate-400 font-bold uppercase">{t("home.collections.collection")}</span>
                <h3 className="font-serif text-xl font-semibold text-slate-900 mt-1">
                  {t("home.collections.courses.title")}
                </h3>
                <p className="mt-2 text-xs text-slate-500 line-clamp-2">
                  {t("home.collections.courses.desc")}
                </p>
              </div>
              <BookOpen className="h-6 w-6 text-slate-400 stroke-1" />
            </div>
            <div className="mt-4 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-900">
              <span>{t("home.collections.courses.btn")}</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </Link>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          FEATURED ARRIVALS — Real Platform Data
         ══════════════════════════════════════════════ */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 border-t border-slate-200/60">
        <div className="mb-12 text-center">
          <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-slate-900">
            {t("home.featured.title")}
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-slate-500 uppercase tracking-widest">{t("home.featured.subtitle")}</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="border border-slate-200 bg-white rounded-none p-4 space-y-4 animate-pulse">
                <div className="aspect-square bg-slate-100" />
                <div className="h-4 w-3/4 bg-slate-100 mx-auto" />
                <div className="h-3 w-1/2 bg-slate-100 mx-auto" />
              </div>
            ))}
          </div>
        ) : featured.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">{t("home.featured.empty")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((product) => {
              const meta = PRODUCT_REVIEW_META[product.id] || { rating: 5.0, reviews: 12 };
              return (
                <div
                  key={product.id}
                  className="group relative overflow-hidden bg-white border border-slate-200 transition-all duration-300 hover:shadow-md flex flex-col justify-between"
                >
                  {/* Thumbnail area */}
                  <div className="relative aspect-square w-full overflow-hidden bg-slate-50">
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-100/60 to-slate-200/60">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm text-slate-800">
                        {product.type === "service" ? (
                          <Briefcase className="h-6 w-6 stroke-1" />
                        ) : (
                          <FileText className="h-6 w-6 stroke-1" />
                        )}
                      </div>
                    </div>
                    
                    {/* Badge */}
                    {meta.badge && (
                      <span className="absolute top-3 left-3 bg-slate-900 text-white text-[9px] font-semibold tracking-wider uppercase px-2 py-0.5">
                        {meta.badge}
                      </span>
                    )}

                    {/* Quick view link */}
                    <div className="absolute inset-x-3 bottom-3 translate-y-8 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 z-20">
                      <Link
                        href={`/products/${product.id}`}
                        className="w-full bg-white text-slate-900 border border-slate-950 hover:bg-slate-900 hover:text-white text-[11px] font-bold py-2.5 tracking-wider uppercase transition-colors flex items-center justify-center gap-1.5 shadow-sm btn-shopify"
                      >
                        View Details
                      </Link>
                    </div>
                  </div>

                  {/* Info area */}
                  <div className="p-4 flex flex-col items-center text-center">
                    {/* Ratings */}
                    <div className="flex items-center gap-1 mb-1.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            "h-3 w-3",
                            i < Math.floor(meta.rating) ? "fill-slate-900 text-slate-900" : "text-slate-200"
                          )}
                        />
                      ))}
                      <span className="text-[10px] text-slate-400 ml-1">({meta.reviews})</span>
                    </div>

                    {/* Title */}
                    <h3 className="font-serif text-[15px] font-semibold text-slate-900 hover:text-slate-500 transition-colors line-clamp-1">
                      <Link href={`/products/${product.id}`}>{localized(product, "title")}</Link>
                    </h3>
                    
                    {/* Desc */}
                    <p className="mt-1 text-xs text-slate-500 line-clamp-1">
                      {localized(product, "description")}
                    </p>

                    {/* Price */}
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <span className="text-sm font-bold text-slate-900 font-mono">
                        {formatPrice(parseFloat(product.price))}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-12 text-center">
          <Button asChild size="lg" variant="outline" className="h-11 px-8 rounded-none border-slate-300 text-slate-800 hover:bg-slate-50 tracking-wider uppercase text-xs font-bold bg-white shadow-sm">
            <Link href="/products" className="inline-flex items-center gap-2">
              {t("home.featured.view_all")} <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          CTA SECTION
         ══════════════════════════════════════════════ */}
      <section className="relative mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8 border-t border-slate-200/60 pt-16">
        <div className="relative overflow-hidden bg-slate-900 p-12 sm:p-16 text-white text-center max-w-4xl mx-auto rounded-none">
          <div className="relative max-w-2xl mx-auto z-10">
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold mb-6">
              {t("home.cta.title")}
            </h2>
            <p className="text-slate-400 mb-8 max-w-lg mx-auto text-xs sm:text-sm">
              {t("home.cta.subtitle")}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button asChild size="lg" className="h-12 px-8 bg-white text-slate-900 hover:bg-slate-100 rounded-none tracking-wider uppercase text-xs font-bold transition-all shadow-md">
                <Link href="/auth/register">
                  {t("nav.register")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-8 border-slate-700 bg-transparent text-white hover:bg-slate-800 rounded-none tracking-wider uppercase text-xs font-bold transition-all">
                <a href="mailto:support@globaltrade-hub.com">
                  {t("footer.contact")}
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
