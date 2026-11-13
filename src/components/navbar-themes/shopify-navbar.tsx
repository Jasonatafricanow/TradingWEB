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
  SheetTitle,
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
  X,
} from "@phosphor-icons/react";
import { useCurrency } from "@/contexts/currency-context";
import { type Locale } from "@/contexts/i18n-context";
import { LOCALES } from "@/config/locale";
import { CURRENCIES, type CurrencyCode } from "@/config/currency";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useUI } from "@/contexts/ui-context";

const localeLabels: Record<Locale, string> = Object.fromEntries(
  LOCALES.map((l) => [l.code, l.label])
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
  const { setCommandOpen, openCart } = useUI();
  const { currency, setCurrency } = useCurrency();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // 购物车数量来自 localStorage，挂载后再渲染，避免 SSR/CSR 不一致
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const cartCount = mounted ? count : 0;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
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
      {/* Announcement bar */}
      <div className="relative z-[60] bg-[var(--footer-bg)] text-[var(--footer-fg)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-9 items-center justify-center gap-2 text-[11px] tracking-wide">
            <span className="h-2 w-2 rounded-md bg-emerald-400" aria-hidden="true" />
            <span className="text-[var(--footer-muted)]">support@fjglobal.online</span>
            <span className="text-[var(--footer-border)]" aria-hidden="true">·</span>
            <span className="font-medium">Global Trade Hub</span>
          </div>
        </div>
      </div>

      {/* Frosted sticky header */}
      <header
        className={cn("sticky top-0 z-50 glass-strong border-b transition-[border-color,box-shadow] duration-200",
          scrolled ? "border-border shadow-soft" : "border-transparent"
        )}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Mobile menu trigger */}
          <div className="flex lg:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button
                  aria-label={t("nav.menu")}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <List className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" title={t("nav.menu")} className="w-[300px] sm:w-[360px] bg-card border-l border-border p-0">
                <div className="flex h-14 items-center justify-between px-5 border-b border-border">
                  <SheetTitle className="font-display text-base font-medium text-foreground">
                    {t("nav.menu")}
                  </SheetTitle>
                  <button
                    onClick={() => setMobileOpen(false)}
                    className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent transition-colors"
                    aria-label={t("nav.close_menu")}
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
                      className={cn("flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                        isActive(href)
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                      )}
                    >
                      {t(labelKey)}
                    </Link>
                  ))}
                </nav>
                {!user && (
                  <div className="absolute bottom-0 left-0 right-0 p-5 border-t border-border space-y-2 bg-muted/60">
                    <Link
                      href="/auth/login"
                      onClick={() => setMobileOpen(false)}
                      className="block w-full rounded-md py-2 text-center text-sm font-medium border border-border bg-card text-foreground transition-colors hover:bg-accent"
                    >
                      {t("nav.login")}
                    </Link>
                    <Link
                      href="/auth/register"
                      onClick={() => setMobileOpen(false)}
                      className="block w-full rounded-md py-2 text-center text-sm font-medium bg-primary text-primary-foreground transition-colors hover:bg-primary-deep"
                    >
                      {t("nav.register")}
                    </Link>
                  </div>
                )}
              </SheetContent>
            </Sheet>
          </div>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0 rounded-md px-1 py-1">
            <span className="font-display text-[17px] font-medium text-foreground">
              {t("brand.short")}
            </span>
            <span className="hidden sm:inline text-[11px] font-medium text-muted-foreground tracking-wide">
              {t("brand.hub")}
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map(({ href, labelKey }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn("rounded-md px-4 py-1.5 text-[13px] font-medium transition-colors duration-200",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                  )}
                >
                  {t(labelKey)}
                </Link>
              );
            })}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-0.5">
            <ThemeToggle />

            {/* Currency Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`${t("nav.currency")}: ${currency}`}
                  className="flex h-9 items-center gap-1 rounded-md px-3 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors font-mono text-[11px] font-medium"
                >
                  <CurrencyCircleDollar className="h-4 w-4" />
                  <span className="hidden sm:inline">{currency}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 font-mono text-xs">
                {CURRENCIES.map((c) => (
                  <DropdownMenuItem
                    key={c.code}
                    onClick={() => setCurrency(c.code as CurrencyCode)}
                    className={cn("gap-3 cursor-pointer", currency === c.code ? "bg-accent font-medium" : "")}
                  >
                    {c.code} · {c.symbol}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Language Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`${t("nav.language")}: ${localeLabels[locale]}`}
                  className="flex h-9 items-center gap-1 rounded-md px-3 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <Globe className="h-4 w-4" />
                  <span className="hidden sm:inline text-xs font-mono font-medium">{locale.toUpperCase()}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {(Object.keys(localeLabels) as Locale[]).map((loc) => (
                  <DropdownMenuItem
                    key={loc}
                    onClick={() => setLocale(loc)}
                    className={cn("gap-3 cursor-pointer", locale === loc ? "bg-accent" : "")}
                  >
                    <span className="manifest-line w-6">{loc.toUpperCase()}</span>
                    <span className="text-sm font-medium">{localeLabels[loc]}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <span className="h-4 w-px bg-border mx-1.5 hidden sm:inline" aria-hidden="true" />

            {/* Cart */}
            <button
              onClick={() => setCommandOpen(true)}
              aria-label={t("command.title")}
              className="flex h-9 items-center gap-2 rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <MagnifyingGlass className="h-4 w-4" />
              <span className="hidden font-mono text-[11px] xl:inline">{t("kbd.cmdk")}</span>
            </button>

            <button
              onClick={openCart}
              aria-label={`${t("nav.cart")}${cartCount > 0 ? ` (${cartCount})` : ""}`}
              className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <ShoppingCart className="h-4 w-4" />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-md px-1 text-[11px] font-medium text-primary-foreground bg-primary">
                  {cartCount > 9 ? t("nav.cart_overflow") : cartCount}
                </span>
              )}
            </button>

            {/* Profile */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={t("nav.account")}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <User className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem className="text-xs text-muted-foreground" disabled>
                    {user.email}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link href="/orders" className="flex items-center gap-2 font-medium">
                      <Package className="h-4 w-4" /> {t("nav.orders")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link href="/account" className="flex items-center gap-2 font-medium">
                      <Gear className="h-4 w-4" /> {t("nav.account")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link href="/admin" className="flex items-center gap-2 font-medium">
                      <Shield className="h-4 w-4" /> {t("admin.title")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={signOut}
                    className="flex items-center gap-2 text-destructive cursor-pointer"
                  >
                    <SignOut className="h-4 w-4" /> {t("nav.logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="hidden sm:flex items-center gap-2 ml-2">
                <Link
                  href="/auth/login"
                  className="rounded-md px-4 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  {t("nav.login")}
                </Link>
                <Link
                  href="/auth/register"
                  className="inline-flex items-center rounded-md bg-primary px-4 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary-deep transition-colors shadow-xs active:scale-[0.97]"
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