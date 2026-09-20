"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/contexts/i18n-context";
import { Globe, ArrowUpRight, Envelope, ChatCircle } from "@phosphor-icons/react";
import { LOCALES } from "@/config/locale";
import type { Locale } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";

const localeLabels: Record<Locale, string> = Object.fromEntries(LOCALES.map(l => [l.code, l.label])) as Record<Locale, string>;
const localeFlags: Record<Locale, string> = Object.fromEntries(LOCALES.map(l => [l.code, l.flag])) as Record<Locale, string>;

const FOOTER_NAV = [
  { titleKey: "nav.products", links: [
    { labelKey: "nav.products", href: "/products" },
    { labelKey: "nav.services", href: "/consulting" },
    { labelKey: "nav.virtual", href: "/digital-goods" },
  ]},
  { titleKey: "footer.about", links: [
    { labelKey: "footer.about", href: "/about" },
    { labelKey: "footer.contact", href: "/contact" },
  ]},
];

const SOCIAL_LINKS = [
  { icon: Envelope, href: "mailto:support@fjglobal.online", label: "Email" },
  { icon: ChatCircle, href: "https://wa.me/258878888181", label: "WhatsApp" },
];

export function TechFooter() {
  const { t, locale, setLocale } = useI18n();

  return (
    <footer className="relative overflow-hidden border-t border-blue-200/60 bg-gradient-to-b from-background to-blue-50/40">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 blob-primary animate-blob opacity-40" />
      <div className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 blob-emerald animate-blob opacity-30" style={{ animationDelay: "-7s" }} />

      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-4">
          {/* ── Brand ── */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{
                  background: "linear-gradient(135deg, #2563eb, #1e40af)",
                  boxShadow: "0 2px 8px rgba(37,99,235,0.35)",
                }}
              >
                <Globe className="h-5 w-5 text-white" weight="bold" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-[15px] font-bold tracking-tight text-foreground">
                  GlobalTrade
                </span>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {t("hero.subtitle")}
            </p>
            {/* Social links */}
            <div className="mt-6 flex gap-3">
              {SOCIAL_LINKS.map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200/60 bg-white/60 text-muted-foreground transition-all hover:border-blue-400 hover:text-blue-600 hover:shadow-soft glass"
                >
                  <Icon className="h-4 w-4" weight="duotone" />
                </a>
              ))}
            </div>
          </div>

          {/* ── Footer Nav Columns ── */}
          {FOOTER_NAV.map(({ titleKey, links }) => (
            <div key={titleKey}>
              <h3 className="text-sm font-semibold text-foreground">
                {t(titleKey)}
              </h3>
              <ul className="mt-4 space-y-3">
                {links.map(({ labelKey, href }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-blue-600"
                    >
                      {t(labelKey)}
                      <ArrowUpRight className="h-3 w-3 opacity-0 transition-all group-hover:opacity-60" weight="bold" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* ── Language / Region ── */}
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              <Globe className="mr-1 inline h-4 w-4 text-blue-600" weight="fill" />
              Language
            </h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {(Object.keys(localeLabels) as Locale[]).map((loc) => (
                <button
                  key={loc}
                  onClick={() => setLocale(loc)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all border",
                    locale === loc
                      ? "bg-blue-600 text-white border-blue-600 shadow-primary-glow"
                      : "bg-white/60 text-muted-foreground border-blue-200/60 hover:border-blue-400 glass"
                  )}
                >
                  <span>{localeFlags[loc]}</span>
                  {localeLabels[loc]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Bottom Bar ── */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-blue-200/60 pt-8 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} GlobalTrade. {t("footer.rights")}.
          </p>
          <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              ONLINE
            </span>
            <span className="text-blue-300">·</span>
            <span>SSL SECURED</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
