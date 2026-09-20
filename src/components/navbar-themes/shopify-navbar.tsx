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

export function ShopifyNavbar() {
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
      {/* Top Banner (Status Bar) - Clean & Minimalist */}
      <div className="relative z-[60] border-b border-slate-200 bg-slate-900 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-9 items-center justify-between text-[11px] font-mono tracking-wider">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5 font-bold">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                <span className="text-emerald-400">FJ ONLINE</span>
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span>support@fjglobal.online</span>
              <span className="text-slate-700">|</span>
              <span className="uppercase text-slate-300">Global Trade Hub</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Header - Centered Logo E-Commerce Theme */}
      <header
        className={cn(
          "sticky top-0 z-50 transition-all duration-200 border-b bg-white",
          scrolled ? "border-slate-200 shadow-sm" : "border-slate-100"
        )}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          
          {/* Mobile menu trigger */}
          <div className="flex lg:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button
                  aria-label="Open menu"
                  className="flex h-9 w-9 items-center justify-center text-slate-700 transition-colors hover:bg-slate-100"
                >
                  <List className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[360px] bg-white border-l border-slate-200 p-0">
                <div className="flex h-16 items-center justify-between px-5 border-b border-slate-200">
                  <span className="font-serif text-lg font-bold tracking-tight text-slate-900">
                    Menu
                  </span>
                  <button
                    onClick={() => setMobileOpen(false)}
                    className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
                    aria-label="Close menu"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <nav className="flex flex-col p-4 space-y-2">
                  {NAV_LINKS.map(({ href, labelKey }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center justify-between px-4 py-3 text-sm font-semibold transition-colors",
                        isActive(href)
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                      )}
                    >
                      {t(labelKey)}
                    </Link>
                  ))}
                </nav>
                {!user && (
                  <div className="absolute bottom-0 left-0 right-0 p-5 border-t border-slate-200 space-y-2 bg-slate-50">
                    <Link
                      href="/auth/login"
                      onClick={() => setMobileOpen(false)}
                      className="block w-full py-2.5 text-center text-xs font-bold uppercase tracking-wider border border-slate-900 text-slate-900 bg-white"
                    >
                      {t("nav.login")}
                    </Link>
                    <Link
                      href="/auth/register"
                      onClick={() => setMobileOpen(false)}
                      className="block w-full py-2.5 text-center text-xs font-bold uppercase tracking-wider bg-slate-900 text-white"
                    >
                      {t("nav.register")}
                    </Link>
                  </div>
                )}
              </SheetContent>
            </Sheet>
          </div>

          {/* Desktop Nav (Left Aligned) */}
          <nav className="hidden lg:flex items-center gap-6">
            {NAV_LINKS.map(({ href, labelKey }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "text-xs font-bold uppercase tracking-widest transition-colors py-2",
                    active ? "text-slate-900 border-b border-slate-900" : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  {t(labelKey)}
                </Link>
              );
            })}
          </nav>

          {/* Logo (Centered) */}
          <Link href="/" className="flex items-center gap-2 group absolute left-1/2 -translate-x-1/2 shrink-0">
            <span className="font-serif text-lg sm:text-xl font-bold tracking-wider text-slate-900 uppercase">
              GlobalTrade Hub
            </span>
          </Link>

          {/* Right Actions */}
          <div className="flex items-center gap-1">
            {/* Currency Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`Currency: ${currency}`}
                  className="flex h-9 items-center gap-1 px-2 text-slate-500 hover:text-slate-900 transition-colors font-mono text-[11px] font-bold"
                >
                  <CurrencyCircleDollar className="h-4.5 w-4.5" />
                  <span className="hidden sm:inline">{currency}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-white border border-slate-200 font-mono text-xs rounded-none shadow-sm">
                {CURRENCIES.map((c) => (
                  <DropdownMenuItem
                    key={c.code}
                    onClick={() => setCurrency(c.code as CurrencyCode)}
                    className={cn("gap-3 cursor-pointer py-2 rounded-none", currency === c.code ? "bg-slate-100 font-bold" : "")}
                  >
                    <span>{c.flag}</span> {c.code} &mdash; {c.symbol}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Language Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`Language: ${localeLabels[locale]}`}
                  className="flex h-9 items-center gap-1 px-2 text-slate-500 hover:text-slate-900 transition-colors"
                >
                  <Globe className="h-4.5 w-4.5" />
                  <span className="hidden sm:inline text-xs font-mono font-bold">{locale.toUpperCase()}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 bg-white border border-slate-200 rounded-none shadow-sm">
                {(Object.keys(localeLabels) as Locale[]).map((loc) => (
                  <DropdownMenuItem
                    key={loc}
                    onClick={() => setLocale(loc)}
                    className={cn("gap-3 cursor-pointer py-2 rounded-none", locale === loc ? "bg-slate-100" : "")}
                  >
                    <span className="font-mono text-[10px] w-5 text-slate-600">{localeFlags[loc]}</span>
                    <span className="text-sm font-semibold">{localeLabels[loc]}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <span className="h-4 w-px bg-slate-200 mx-1.5 hidden sm:inline" />

            {/* Cart Icon */}
            <Link
              href="/cart"
              aria-label={`${t("nav.cart")}${count > 0 ? ` (${count})` : ""}`}
              className="relative flex h-9 w-9 items-center justify-center text-slate-500 hover:text-slate-900 transition-colors"
            >
              <ShoppingCart className="h-4.5 w-4.5" />
              {count > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full text-[9px] font-bold text-white bg-slate-900">
                  {count}
                </span>
              )}
            </Link>

            {/* Profile Dropdown */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={t("nav.account")}
                    className="flex h-9 w-9 items-center justify-center text-slate-500 hover:text-slate-900 transition-colors"
                  >
                    <User className="h-4.5 w-4.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-white border border-slate-200 rounded-none shadow-sm">
                  <DropdownMenuItem className="text-xs text-slate-400 py-2" disabled>
                    {user.email}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="rounded-none py-2 cursor-pointer">
                    <Link href="/orders" className="flex items-center gap-2 font-medium">
                      <Package className="h-4 w-4" /> {t("nav.orders")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="rounded-none py-2 cursor-pointer">
                    <Link href="/account" className="flex items-center gap-2 font-medium">
                      <Gear className="h-4 w-4" /> {t("nav.account")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="rounded-none py-2 cursor-pointer">
                    <Link href="/admin" className="flex items-center gap-2 font-medium">
                      <Shield className="h-4 w-4" /> {t("admin.title")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={signOut}
                    className="flex items-center gap-2 text-red-600 rounded-none py-2 cursor-pointer"
                  >
                    <SignOut className="h-4 w-4" /> {t("nav.logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="hidden sm:flex items-center gap-3 ml-2">
                <Link
                  href="/auth/login"
                  className="text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 py-1 transition-colors"
                >
                  {t("nav.login")}
                </Link>
                <Link
                  href="/auth/register"
                  className="inline-flex items-center rounded-none bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-slate-800 transition-colors shadow-sm"
                >
                  {t("nav.register")}
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
