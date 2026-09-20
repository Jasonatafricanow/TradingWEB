"use client";

import Link from "next/link";
import { useI18n } from "@/contexts/i18n-context";
import { Globe, ArrowUpRight } from "@phosphor-icons/react";
import { LOCALES } from "@/config/locale";
import type { Locale } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";
import { Envelope, ChatCircle } from "@phosphor-icons/react";

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

export function ShopifyFooter() {
  const { t, locale, setLocale } = useI18n();

  return (
    <footer className="bg-slate-900 border-t border-slate-800 text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-4">
          
          {/* Brand Col */}
          <div className="md:col-span-1">
            <span className="font-serif text-xl font-bold tracking-wider text-white uppercase">
              GlobalTrade Hub
            </span>
            <p className="mt-4 text-xs leading-relaxed text-slate-400">
              面向国际贸易领域的专业商业咨询服务与高质量数字化模板交易平台。
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
                  className="flex h-9 w-9 items-center justify-center border border-slate-700 bg-slate-800 text-slate-400 transition-colors hover:border-slate-500 hover:text-white"
                >
                  <Icon className="h-4.5 w-4.5" />
                </a>
              ))}
            </div>
          </div>

          {/* Nav columns */}
          {FOOTER_NAV.map(({ titleKey, links }) => (
            <div key={titleKey}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                {t(titleKey)}
              </h3>
              <ul className="mt-4 space-y-3">
                {links.map(({ labelKey, href }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="group inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      {t(labelKey)}
                      <ArrowUpRight className="h-3 w-3 opacity-0 transition-all group-hover:opacity-60" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Language Selector */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Language / 语言
            </h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {(Object.keys(localeLabels) as Locale[]).map((loc) => (
                <button
                  key={loc}
                  onClick={() => setLocale(loc)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all border rounded-none",
                    locale === loc
                      ? "bg-white text-slate-900 border-white"
                      : "bg-transparent text-slate-400 border-slate-800 hover:border-slate-600"
                  )}
                >
                  <span>{localeFlags[loc]}</span>
                  {localeLabels[loc]}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Bottom copyright info */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-8 sm:flex-row text-xs text-slate-500">
          <p>
            &copy; {new Date().getFullYear()} GlobalTrade Hub. All rights reserved.
          </p>
          <div className="flex items-center gap-4 font-mono">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              ONLINE
            </span>
            <span className="text-slate-800">|</span>
            <span>SECURED SSL</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
