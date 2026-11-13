"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Globe, ShieldCheck, Truck, Briefcase, ArrowRight, MapPin, Envelope, ChatCircle,
} from "@phosphor-icons/react";
import { useI18n } from "@/contexts/i18n-context";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/reveal";

const STATS = [
  { value: "3,268", labelKey: "about.stat.customers" },
  { value: "50+", labelKey: "home.stats.countries" },
  { value: "24", labelKey: "about.stat.catalog" },
  { value: "4.8", labelKey: "about.stat.rating" },
];

const PILLARS = [
  { Icon: Briefcase, titleKey: "about.pillar.advisory.title", descKey: "about.pillar.advisory.desc" },
  { Icon: Truck, titleKey: "about.pillar.logistics.title", descKey: "about.pillar.logistics.desc" },
  { Icon: ShieldCheck, titleKey: "about.pillar.trust.title", descKey: "about.pillar.trust.desc" },
];

const OFFICES = [
  { city: "Shanghai", role: "HQ · Sourcing", addr: "Century Avenue 100, Pudong", tz: "UTC+8" },
  { city: "Hamburg", role: "EU Fulfilment", addr: "Lagerstraße 14, Halle B", tz: "UTC+1" },
  { city: "São Paulo", role: "LATAM Partners", addr: "Av. Paulista 1000, Bela Vista", tz: "UTC-3" },
];

export default function AboutPage() {
  const { t } = useI18n();

  return (
    <div className="bg-background text-foreground">
      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 pt-12 pb-16 sm:px-6 sm:pt-16 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-1.5 text-[11px] font-medium text-muted-foreground shadow-xs">
              <Globe className="h-3.5 w-3.5" />
              {t("about.eyebrow")}
            </span>
            <h1 className="mt-6 font-display text-balance text-4xl font-medium leading-[1.08] sm:text-5xl">
              {t("about.title")}
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              {t("about.subtitle")}
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg" className="group">
                <Link href="/products">
                  {t("home.hero.cta.primary")}
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/contact">{t("footer.contact")}</Link>
              </Button>
            </div>
          </div>
          <Reveal>
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border shadow-lift">
              <Image
                src="/images/catalog/business-meeting-2.jpg"
                alt={t("about.image_alt")}
                fill
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" aria-hidden="true" />
            </div>
          </Reveal>
        </div>

        {/* Stats */}
        <div className="mt-14 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <Reveal key={s.labelKey} delay={i * 70}>
              <div className="rounded-2xl border border-border bg-card px-6 py-5 shadow-card">
                <div className="font-display text-3xl font-medium">{s.value}</div>
                <div className="mt-2 text-[11.5px] text-muted-foreground">
                  {t(s.labelKey)}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Pillars */}
      <section className="border-t border-border bg-muted/40 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mb-10 max-w-2xl">
            <h2 className="font-display text-2xl font-medium sm:text-3xl">
              {t("about.pillars.title")}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t("about.pillars.subtitle")}
            </p>
          </Reveal>
          <div className="grid gap-5 md:grid-cols-3">
            {PILLARS.map(({ Icon, titleKey, descKey }, i) => (
              <Reveal key={titleKey} delay={i * 90}>
                <div className="h-full rounded-2xl border border-border bg-card p-6 shadow-card transition-colors duration-200">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 font-display text-lg font-medium">{t(titleKey)}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{t(descKey)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Operations */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border shadow-lift">
              <Image
                src="/images/catalog/warehouse-logistics-2.jpg"
                alt={t("about.ops.image_alt")}
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="font-display text-2xl font-medium sm:text-3xl">
              {t("about.ops.title")}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t("about.ops.desc")}</p>
            <div className="mt-8 space-y-3">
              {OFFICES.map((o) => (
                <div key={o.city} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
                  <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-display text-sm font-medium">{o.city}</span>
                      <span className="text-[11px] text-muted-foreground">{o.role}</span>
                    </div>
                    <p className="mt-1 truncate text-[13px] text-muted-foreground">{o.addr}</p>
                  </div>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{o.tz}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-[var(--footer-bg)] p-10 sm:p-14">
            <Image
              src="/images/catalog/cargo-ship-1.jpg"
              alt=""
              fill
              sizes="(min-width: 1320px) 1240px, calc(100vw - 2rem)"
              className="object-cover opacity-45"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/20" aria-hidden="true" />
            <div className="relative z-10 max-w-xl">
              <h2 className="font-display text-3xl font-medium text-white sm:text-4xl">
                {t("about.cta.title")}
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-white/75">{t("about.cta.desc")}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="bg-white text-[#101828] hover:bg-white/90">
                  <Link href="/contact">
                    <Envelope className="mr-1 h-4 w-4" />
                    {t("footer.contact")}
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                  <a href="https://wa.me/258878888181" target="_blank" rel="noopener noreferrer">
                    <ChatCircle className="mr-1 h-4 w-4" />
                    {t("about.whatsapp")}
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}