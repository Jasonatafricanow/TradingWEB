"use client";

import Link from "next/link";
import { useI18n } from "@/contexts/i18n-context";
import { ArrowUpRight, Envelope, ChatCircle } from "@phosphor-icons/react";
import { LOCALES } from "@/config/locale";
import type { Locale } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";

const localeLabels: Record<Locale, string> = Object.fromEntries(LOCALES.map(l => [l.code, l.label])) as Record<Locale, string>;

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
    <footer className="bg-[var(--footer-bg)] text-[var(--footer-fg)]">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-1">
            <span className="font-display text-lg font-medium text-white">
              GlobalTrade Hub
            </span>
            <p className="mt-4 text-[13px] leading-relaxed text-[var(--footer-muted)]">
              {t("footer.tagline")}
            </p>
            <div className="mt-6 flex gap-2">
              {SOCIAL_LINKS.map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--footer-border)] bg-white/5 text-[var(--footer-muted)] transition-colors duration-200 hover:border-white/30 hover:text-white"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Nav columns */}
          {FOOTER_NAV.map(({ titleKey, links }) => (
            <div key={titleKey}>
              <h3 className="text-xs font-medium text-white">
                {t(titleKey)}
              </h3>
              <ul className="mt-4 space-y-3">
                {links.map(({ labelKey, href }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="group inline-flex items-center gap-1 text-[13px] text-[var(--footer-muted)] transition-colors duration-200 hover:text-white"
                    >
                      {t(labelKey)}
                      <ArrowUpRight className="h-3 w-3 opacity-0 transition-colors duration-200 group-hover:opacity-60" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Language */}
          <div>
            <h3 className="text-xs font-medium text-white">
              {t("nav.language")}
            </h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {(Object.keys(localeLabels) as Locale[]).map((loc) => (
                <button
                  key={loc}
                  onClick={() => setLocale(loc)}
                  className={cn("inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200 border",
                    locale === loc
                      ? "bg-white text-[#101828] border-white"
                      : "bg-transparent text-[var(--footer-muted)] border-[var(--footer-border)] hover:border-white/30 hover:text-white"
                  )}
                >
                  {localeLabels[loc]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[var(--footer-border)] pt-8 sm:flex-row text-xs text-[var(--footer-muted)]">
          <p>
            &copy; {new Date().getFullYear()} {t("brand.name")}. {t("footer.rights")}.
          </p>
          <p className="manifest-line">{t("footer.facts")}</p>
        </div>
      </div>
    </footer>
  );
}