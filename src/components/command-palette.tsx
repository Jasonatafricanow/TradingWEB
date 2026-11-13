"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  MagnifyingGlass, Package, Briefcase, FileText, Truck, Receipt,
  User, ShoppingCart, ArrowRight, Clock, Globe,
} from "@phosphor-icons/react";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator,
} from "@/components/ui/command";
import { useUI } from "@/contexts/ui-context";
import { useI18n } from "@/contexts/i18n-context";
import { useCurrency } from "@/contexts/currency-context";

interface SearchProduct {
  id: string;
  title: string;
  title_en: string | null;
  price: string;
  type: string;
  image_key: string | null;
  vendor?: string;
}

interface RecentItem {
  id: string;
  title: string;
  image_key: string | null;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  physical: <Package className="h-4 w-4" />,
  service: <Briefcase className="h-4 w-4" />,
  virtual: <FileText className="h-4 w-4" />,
};

export const RECENT_KEY = "tradingweb_recent";

export function readRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function pushRecent(item: RecentItem) {
  try {
    const list = readRecent().filter((r) => r.id !== item.id);
    list.unshift(item);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6)));
  } catch {
    /* 隐私模式下忽略 */
  }
}

export function CommandPalette() {
  const { commandOpen, setCommandOpen } = useUI();
  const { t, locale } = useI18n();
  const { format } = useCurrency();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [catalog, setCatalog] = useState<SearchProduct[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const loadedRef = useRef(false);

  // 搜索防抖 250ms
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim().toLowerCase()), 250);
    return () => window.clearTimeout(id);
  }, [query]);

  // 首次打开时载入目录与最近浏览
  useEffect(() => {
    if (!commandOpen) return;
    setRecent(readRecent());
    if (loadedRef.current) return;
    loadedRef.current = true;
    fetch("/api/products")
      .then((r) => r.json())
      .then((j) => setCatalog(j.data || []))
      .catch(() => setCatalog([]));
  }, [commandOpen]);

  const loc = useCallback(
    (p: SearchProduct) => (locale === "zh" ? p.title : p.title_en || p.title),
    [locale]
  );

  const results = useMemo(() => {
    if (!debounced) return catalog.slice(0, 6);
    return catalog
      .filter((p) => {
        const hay = `${p.title} ${p.title_en || ""} ${p.vendor || ""}`.toLowerCase();
        return hay.includes(debounced);
      })
      .slice(0, 8);
  }, [catalog, debounced]);

  useEffect(() => { setActiveCount(results.length); }, [results]);

  const go = useCallback(
    (href: string) => {
      setCommandOpen(false);
      setQuery("");
      router.push(href);
    },
    [router, setCommandOpen]
  );

  const navItems = [
    { href: "/products", label: t("nav.products"), Icon: Package },
    { href: "/products?type=service", label: t("nav.services"), Icon: Briefcase },
    { href: "/products?type=virtual", label: t("nav.virtual"), Icon: FileText },
    { href: "/products?type=physical", label: t("command.physical"), Icon: Truck },
    { href: "/orders", label: t("nav.orders"), Icon: Receipt },
    { href: "/account", label: t("command.account"), Icon: User },
    { href: "/cart", label: t("nav.cart"), Icon: ShoppingCart },
    { href: "/contact", label: t("footer.contact"), Icon: Globe },
  ].filter((n) => !debounced || n.label.toLowerCase().includes(debounced));

  return (
    <CommandDialog
      open={commandOpen}
      onOpenChange={(v) => { setCommandOpen(v); if (!v) setQuery(""); }}
      title={t("command.title")}
      description={t("command.description")}
      className="overflow-hidden rounded-2xl border border-border p-0 sm:max-w-xl"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={t("command.placeholder")}
        className="h-12"
      />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>
          <span className="flex flex-col items-center gap-2 py-6 text-[13px] text-muted-foreground">
            <MagnifyingGlass className="h-5 w-5" />
            {t("command.empty")}
          </span>
        </CommandEmpty>

        {!debounced && recent.length > 0 && (
          <>
            <CommandGroup heading={t("command.recent")}>
              {recent.map((r) => (
                <CommandItem
                  key={r.id}
                  value={`recent-${r.id}-${r.title}`}
                  onSelect={() => go(`/products/${r.id}`)}
                  className="gap-3 rounded-md px-3 py-2"
                >
                  <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                    {r.image_key && <Image src={r.image_key} alt="" fill sizes="32px" className="object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{r.title}</span>
                  <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {results.length > 0 && (
          <CommandGroup heading={debounced ? t("command.results") : t("command.catalog")}>
            {results.map((p) => (
              <CommandItem
                key={p.id}
                value={`${p.id}-${p.title}-${p.title_en || ""}`}
                onSelect={() => go(`/products/${p.id}`)}
                className="gap-3 rounded-md px-3 py-2"
              >
                <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                  {p.image_key
                    ? <Image src={p.image_key} alt="" fill sizes="36px" className="object-cover" />
                    : <span className="flex h-full w-full items-center justify-center text-muted-foreground">{TYPE_ICON[p.type]}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{loc(p)}</span>
                  <span className="manifest-line mt-0.5 block">{p.vendor || t("brand.short")}</span>
                </span>
                <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
                  {format(Number(p.price))}
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {navItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("command.navigate")}>
              {navItems.map(({ href, label, Icon }) => (
                <CommandItem
                  key={href}
                  value={`nav-${href}-${label}`}
                  onSelect={() => go(href)}
                  className="gap-3 rounded-md px-3 py-2"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-[13px]">{label}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>

      <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
        <span className="manifest-line" aria-live="polite">
          {debounced ? `${activeCount} ${t("command.match_count")}` : t("command.hint")}
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">↑↓</kbd>
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">↵</kbd>
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{t("kbd.esc")}</kbd>
        </span>
      </div>
    </CommandDialog>
  );
}