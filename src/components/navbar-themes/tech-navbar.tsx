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

export function TechNavbar() {
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
      {/* Status bar */}
      <div className="relative z-[60] border-b border-border bg-card/70 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-8 items-center justify-between text-[11px] font-mono text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-md bg-emerald-500" aria-hidden="true" />
                <span className="text-emerald-600 dark:text-emerald-400"></span>
              </span>
              <span className="hidden sm:inline text-border" aria-hidden="true">·</span>
              <span className="hidden sm:inline">MARKETPLACE</span>
            </div>
            <div className="flex items-center gap-3">
              <span>support@fjglobal.online</span>
            </div>
          </div>
        </div>
      </div>

      {/* Frosted sticky header */}
      <header
        className={cn("sticky top-0 z-50 glass-strong border-b transition-[border-color,box-shadow] duration-200",
          scrolled ? "border-border shadow-soft" : "border-transparent"
        )}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
              <Globe className="h-5 w-5 text-white" weight="bold" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-display text-[15px] font-medium text-foreground">
                GlobalTrade
              </span>
              <span className="text-[11px] font-mono text-primary/70">
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
                  className={cn("rounded-md px-4 py-1.5 text-[13.5px] font-medium transition-colors duration-200",
                    active
                      ? "bg-primary-soft text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
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

            {/* Currency */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`${t("nav.currency")}: ${currency}`}
                  className="hidden sm:flex h-9 items-center gap-1 rounded-md px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground font-mono text-[11px]"
                >
                  <CurrencyCircleDollar className="h-4 w-4" weight="duotone" />
                  <span className="hidden sm:inline">{currency}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="font-mono text-xs">
                {CURRENCIES.map((c) => (
                  <DropdownMenuItem
                    key={c.code}
                    onClick={() => setCurrency(c.code as CurrencyCode)}
                    className={cn("gap-3 cursor-pointer", currency === c.code ? "bg-accent text-foreground font-medium" : "")}
                  >
                    {c.code} · {c.symbol}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Language */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`${t("nav.language")}: ${localeLabels[locale]}`}
                  className="hidden sm:flex h-9 items-center gap-1 rounded-md px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Globe className="h-4 w-4" weight="duotone" />
                  <span className="hidden sm:inline text-xs font-mono">{locale.toUpperCase()}</span>
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
                    <span className="text-sm">{localeLabels[loc]}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="hidden sm:block h-5 w-px bg-border mx-1" aria-hidden="true" />

            {/* Cart */}
            <button
              onClick={() => setCommandOpen(true)}
              aria-label={t("command.title")}
              className="flex h-9 items-center gap-2 rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <MagnifyingGlass className="h-4 w-4" weight="duotone" />
              <span className="hidden font-mono text-[11px] xl:inline">⌘K</span>
            </button>

            <button
              onClick={openCart}
              aria-label={`${t("nav.cart")}${cartCount > 0 ? ` (${cartCount})` : ""}`}
              className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ShoppingCart className="h-4 w-4" weight="duotone" />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-md px-1 text-[11px] font-medium text-primary-foreground bg-primary">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </button>

            {/* User / Auth */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={t("nav.account")}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <User className="h-4 w-4" weight="duotone" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
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
                    className="flex items-center gap-2 text-destructive"
                  >
                    <SignOut className="h-4 w-4" /> {t("nav.logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="hidden sm:flex items-center gap-2">
                <Link
                  href="/auth/login"
                  className="rounded-md px-4 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
                >
                  {t("nav.login")}
                </Link>
                <Link
                  href="/auth/register"
                  className="inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-[13px] font-medium text-primary-foreground bg-primary transition-colors duration-200 hover:opacity-90 active:scale-[0.97]"
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
                  aria-label={t("nav.menu")}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent lg:hidden"
                >
                  <List className="h-4 w-4" weight="duotone" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" title={t("nav.menu")} className="w-[300px] sm:w-[360px] bg-card border-l border-border p-0">
                <div className="flex h-16 items-center justify-between px-5 border-b border-border">
                  <span className="font-mono text-[11px] text-primary">
                    {t("nav.menu")}
                  </span>
                  <button
                    onClick={() => setMobileOpen(false)}
                    className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent transition-colors"
                    aria-label={t("nav.close_menu")}
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
                      className={cn("flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                        isActive(href)
                          ? "bg-primary-soft text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                    >
                      {t(labelKey)}
                    </Link>
                  ))}
                </nav>
                <div className="space-y-4 border-t border-border px-5 py-4">
                  <div>
                    <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                      {t("nav.language")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(localeLabels) as Locale[]).map((loc) => (
                        <button
                          key={loc}
                          onClick={() => setLocale(loc)}
                          className={cn("rounded-md border px-3 py-1 text-xs font-medium transition-colors",
                            locale === loc
                              ? "border-primary bg-primary-soft text-primary"
                              : "border-border text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {localeLabels[loc]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                      {t("nav.currency")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {CURRENCIES.map((c) => (
                        <button
                          key={c.code}
                          onClick={() => setCurrency(c.code as CurrencyCode)}
                          className={cn("rounded-md border px-3 py-1 font-mono text-xs transition-colors",
                            currency === c.code
                              ? "border-primary bg-primary-soft text-primary"
                              : "border-border text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {c.code}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {!user && (
                  <div className="absolute bottom-0 left-0 right-0 p-5 border-t border-border space-y-2">
                    <div className="flex gap-2">
                      <Link
                        href="/auth/login"
                        onClick={() => setMobileOpen(false)}
                        className="flex-1 rounded-md border border-border bg-card px-4 py-2 text-center text-sm font-medium text-foreground transition-colors hover:bg-accent"
                      >
                        {t("nav.login")}
                      </Link>
                      <Link
                        href="/auth/register"
                        onClick={() => setMobileOpen(false)}
                        className="flex-1 rounded-full bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground"
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