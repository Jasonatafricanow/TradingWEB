"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { useCart } from "@/contexts/cart-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Globe,
  ShoppingCart,
  User,
  List,
  SignOut,
  Package,
  Gear,
  Shield,
  CurrencyCircleDollar,
  ArrowRight,
  X,
} from "@phosphor-icons/react";
import { useCurrency } from "@/contexts/currency-context";
import { type Locale } from "@/contexts/i18n-context";
import { LOCALES } from "@/config/locale";
import { CURRENCIES, type CurrencyCode } from "@/config/currency";
import { cn } from "@/lib/utils";

const localeLabels: Record<Locale, string> = Object.fromEntries(
  LOCALES.map((l) => [l.code, l.label])
) as Record<Locale, string>;

const localeFlags: Record<Locale, string> = Object.fromEntries(
  LOCALES.map((l) => [l.code, l.flag])
) as Record<Locale, string>;

const NAV_LINKS = [
  { href: "/products", labelKey: "nav.products" },
  { href: "/consulting", labelKey: "nav.services" },
  { href: "/digital-goods", labelKey: "nav.virtual" },
];

export function TechNavbar() {
  const { user, signOut } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const { count } = useCart();
  const { currency, setCurrency } = useCurrency();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (href: string) =>
    pathname === href ||
    pathname.startsWith(href + "?") ||
    (href !== "/" && pathname.startsWith(href));

  return (
    <>
      {/* Status Bar */}
      <div className="relative z-[60] border-b border-blue-200/60 bg-white/70 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-8 items-center justify-between text-[11px] font-mono text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                <span className="text-emerald-600">SYSTEM ONLINE</span>
              </span>
              <span className="hidden sm:inline text-blue-300">·</span>
              <span className="hidden sm:inline">MARKETPLACE</span>
            </div>
            <div className="flex items-center gap-3">
              <span>support@fjglobal.online</span>
              <span className="text-blue-300">·</span>
              <span>LANG <span className="text-blue-600 font-semibold">ZH</span> / EN / PT</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <header
        className={cn(
          "sticky top-0 z-50 transition-all duration-300",
          scrolled
            ? "glass-strong border-b border-blue-200/60 shadow-soft"
            : "bg-transparent"
        )}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group shrink-0">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{
                background: "linear-gradient(135deg, #2563eb, #1e40af)",
                boxShadow: "0 2px 8px rgba(37, 99, 235, 0.35)",
              }}
            >
              <Globe className="h-5 w-5 text-white" weight="bold" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-[15px] font-bold tracking-tight text-foreground">
                GlobalTrade
              </span>
              <span className="text-[9.5px] font-mono text-blue-600/70 tracking-[0.18em] uppercase">
                Trade Without Borders
              </span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map(({ href, labelKey }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "group relative px-3.5 py-2 text-[13.5px] font-medium rounded-md transition-all",
                    active
                      ? "text-blue-700 bg-blue-50/80"
                      : "text-foreground/70 hover:text-blue-700 hover:bg-blue-50"
                  )}
                >
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    {active && <span className="h-1 w-1 rounded-full bg-blue-500" />}
                    {t(labelKey)}
                  </span>
                </Link>
              );
            })}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-1.5">
            {/* Currency */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`Currency: ${currency}`}
                  className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-muted-foreground transition-colors hover:bg-blue-50 hover:text-blue-700 font-mono text-[11px]"
                >
                  <CurrencyCircleDollar className="h-4 w-4" weight="duotone" />
                  <span className="hidden sm:inline">{currency}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="glass-strong border-blue-200/60 font-mono text-xs">
                {CURRENCIES.map((c) => (
                  <DropdownMenuItem
                    key={c.code}
                    onClick={() => setCurrency(c.code as CurrencyCode)}
                    className={cn("gap-3 cursor-pointer", currency === c.code ? "bg-blue-50 text-blue-700" : "")}
                  >
                    <span>{c.flag}</span> {c.code} &mdash; {c.symbol}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Language */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`Language: ${localeLabels[locale]}`}
                  className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-muted-foreground transition-colors hover:bg-blue-50 hover:text-blue-700"
                >
                  <Globe className="h-4 w-4" weight="duotone" />
                  <span className="hidden sm:inline text-xs font-mono">{locale.toUpperCase()}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 glass-strong border-blue-200/60">
                {(Object.keys(localeLabels) as Locale[]).map((loc) => (
                  <DropdownMenuItem
                    key={loc}
                    onClick={() => setLocale(loc)}
                    className={cn("gap-3 cursor-pointer", locale === loc ? "bg-blue-50" : "")}
                  >
                    <span className="font-mono text-[10px] w-5 text-blue-600">{localeFlags[loc]}</span>
                    <span className="text-sm">{localeLabels[loc]}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="hidden sm:block h-5 w-px bg-border mx-0.5" />

            {/* Cart */}
            <Link
              href="/cart"
              aria-label={`${t("nav.cart")}${count > 0 ? ` (${count})` : ""}`}
              className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-blue-50 hover:text-blue-700"
            >
              <ShoppingCart className="h-4 w-4" weight="duotone" />
              {count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white bg-blue-600">
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </Link>

            {/* User / Auth */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={t("nav.account")}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-blue-50 hover:text-blue-700"
                  >
                    <User className="h-4 w-4" weight="duotone" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 glass-strong border-blue-200/60">
                  <DropdownMenuItem className="text-xs text-muted-foreground" disabled>
                    {user.email}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/orders" className="flex items-center gap-2">
                      <Package className="h-4 w-4" /> {t("nav.orders")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/account" className="flex items-center gap-2">
                      <Gear className="h-4 w-4" /> {t("nav.account")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin" className="flex items-center gap-2">
                      <Shield className="h-4 w-4" /> {t("admin.title")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={signOut}
                    className="flex items-center gap-2 text-red-600"
                  >
                    <SignOut className="h-4 w-4" /> {t("nav.logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="hidden sm:flex items-center gap-1.5">
                <Link
                  href="/auth/login"
                  className="px-3.5 py-1.5 text-[13px] font-medium text-foreground/70 transition-colors hover:text-blue-700"
                >
                  {t("nav.login")}
                </Link>
                <Link
                  href="/auth/register"
                  className="shimmer inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold text-white bg-gradient-to-br from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 shadow-primary-glow"
                >
                  {t("nav.register")}
                  <ArrowRight className="h-3.5 w-3.5" weight="bold" />
                </Link>
              </div>
            )}

            {/* Mobile Menu */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button
                  aria-label="Open menu"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-blue-50 lg:hidden"
                >
                  <List className="h-4 w-4" weight="duotone" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[360px] glass-strong border-l border-blue-200/60 p-0">
                <div className="flex h-16 items-center justify-between px-5 border-b border-border">
                  <span className="font-mono text-[11px] tracking-[0.18em] text-blue-600 uppercase">
                    Navigation
                  </span>
                  <button
                    onClick={() => setMobileOpen(false)}
                    className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-blue-50 transition-colors"
                    aria-label="Close menu"
                  >
                    <X className="h-4 w-4" weight="duotone" />
                  </button>
                </div>
                <nav className="flex flex-col p-3">
                  {NAV_LINKS.map(({ href, labelKey }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center justify-between px-3 py-3 text-sm font-medium rounded-md transition-colors",
                        isActive(href)
                          ? "bg-blue-50 text-blue-700"
                          : "text-foreground/70 hover:text-blue-700 hover:bg-blue-50"
                      )}
                    >
                      {t(labelKey)}
                    </Link>
                  ))}
                </nav>
                {!user && (
                  <div className="absolute bottom-0 left-0 right-0 p-5 border-t border-border space-y-2">
                    <div className="flex gap-2">
                      <Link
                        href="/auth/login"
                        onClick={() => setMobileOpen(false)}
                        className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-center text-sm font-medium text-blue-700"
                      >
                        {t("nav.login")}
                      </Link>
                      <Link
                        href="/auth/register"
                        onClick={() => setMobileOpen(false)}
                        className="flex-1 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 px-4 py-2 text-center text-sm font-semibold text-white"
                      >
                        {t("nav.register")}
                      </Link>
                    </div>
                  </div>
                )}
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
    </>
  );
}
