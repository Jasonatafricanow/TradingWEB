"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { useCart, type CartItem } from "@/contexts/cart-context";
import { useCurrency } from "@/contexts/currency-context";
import { useI18n } from "@/contexts/i18n-context";
import { Button } from "@/components/ui/button";
import { ProductThumb } from "@/components/product-thumb";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/utils";
import {
  ShoppingCart, Trash, Minus, Plus, ArrowLeft, ArrowRight,
  ShieldCheck, Truck, ArrowCounterClockwise, Lock, Package,
} from "@phosphor-icons/react";
import { BreadcrumbPublic } from "@/components/breadcrumb-public";

interface Suggestion {
  id: string;
  title: string;
  title_en: string | null;
  price: string;
  type: string;
  image_key: string | null;
}

/** 免运费门槛（与演示配送区最低档一致） */
const FREE_SHIPPING_AT = 300;

export default function CartPage() {
  const { items, addItem, removeItem, updateQuantity, total, count, clearCart } = useCart();
  const { format: formatPrice } = useCurrency();
  const { t, locale } = useI18n();
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    fetch("/api/products?limit=8&sort=featured")
      .then((r) => r.json())
      .then((j) => setSuggestions((j.data || []).slice(0, 4)))
      .catch(() => {});
  }, []);

  const loc = (p: Suggestion) =>
    locale === "zh" ? p.title : p.title_en || p.title;

  const keyOf = (i: CartItem) =>
    [i.id, i.variant_id || "", i.delivery_method || ""].filter(Boolean).join("::") || i.id;

  const restore = (item: CartItem) => {
    addItem({
      id: item.id,
      title: item.title,
      price: item.price,
      type: item.type,
      image_key: item.image_key,
      variant_id: item.variant_id ?? null,
      variant_name: item.variant_name ?? null,
      delivery_method: item.delivery_method ?? null,
    });
    updateQuantity(item.id, item.quantity, item.variant_id || undefined, item.delivery_method || undefined);
  };

  const removeWithUndo = (item: CartItem) => {
    removeItem(item.id, item.variant_id || undefined, item.delivery_method || undefined);
    toast(t("cart.item_removed"), {
      description: item.title,
      action: {
        label: t("cart.undo"),
        onClick: () => { restore(item); toast.success(t("cart.restored")); },
      },
      duration: 6000,
    });
  };

  const clearWithUndo = () => {
    const snapshot = [...items];
    clearCart();
    toast(t("cart.cleared"), {
      action: {
        label: t("cart.undo"),
        onClick: () => { snapshot.forEach(restore); toast.success(t("cart.restored")); },
      },
      duration: 6000,
    });
  };

  // 交叉推荐排除购物车中已有的商品，避免推荐重复项
  const crossSell = suggestions.filter((p) => !items.some((i) => i.id === p.id)).slice(0, 4);

  const remaining = Math.max(0, FREE_SHIPPING_AT - total);
  const progress = Math.min(100, (total / FREE_SHIPPING_AT) * 100);

  // 首帧与服务端保持一致，挂载后再渲染本地购物车内容
  if (!mounted) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 h-5 w-32 animate-pulse rounded-md bg-muted" />
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-8">
            {[1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />)}
          </div>
          <div className="h-72 animate-pulse rounded-3xl bg-muted lg:col-span-4" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <BreadcrumbPublic items={[{ label: t("crumb.cart") }]} />
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card px-6 py-16 text-center shadow-card">
          <div className="relative">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <ShoppingCart className="h-8 w-8" weight="duotone" />
            </span>
            <h1 className="mt-6 font-display text-2xl font-medium sm:text-3xl">
              {t("cart.empty")}
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              {t("cart.empty_desc")}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link href="/products">
                  {t("home.hero.cta.primary")}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/consulting">{t("home.hero.cta.secondary")}</Link>
              </Button>
            </div>
          </div>
        </div>

        {crossSell.length > 0 && (
          <div className="mt-14">
            <h2 className="mb-5 font-display text-xl font-medium">
              {t("cart.recommend_title")}
            </h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {crossSell.map((p, i) => (
                <Reveal key={p.id} delay={i * 70}>
                  <Link href={`/products/${p.id}`} className="group block">
                    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-colors duration-200">
                      <div className="relative aspect-[4/3] overflow-hidden">
                        <ProductThumb type={p.type} image={p.image_key} alt={loc(p)} sizes="(min-width:1024px) 22vw, 50vw" />
                      </div>
                      <div className="p-4">
                        <p className="line-clamp-1 text-[13.5px] font-medium transition-colors group-hover:text-primary">{loc(p)}</p>
                        <p className="mt-1 font-mono text-sm font-medium">{formatPrice(Number(p.price))}</p>
                      </div>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <BreadcrumbPublic items={[{ label: t("crumb.cart") }]} />

      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium sm:text-4xl">
            {t("cart.title")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {count} {t("cart.items_count")}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={clearWithUndo} className="text-muted-foreground hover:text-destructive">
          <Trash className="mr-1 h-4 w-4" />
          {t("cart.clear_all")}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        {/* ── Items ── */}
        <div className="lg:col-span-8">
          {/* Free shipping progress */}
          <div className="mb-4 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-center gap-2">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                remaining === 0 ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" : "bg-primary-soft text-primary"
              )}>
                <Truck className="h-4 w-4" />
              </span>
              <p className="text-[13px] font-medium">
                {remaining === 0
                  ? t("cart.free_shipping_unlocked")
                  : `${t("cart.free_shipping_progress")} ${formatPrice(remaining)}`}
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-md bg-muted">
              <div
                className={cn("h-full rounded-full transition-[width] duration-200 ease-out",
                  remaining === 0 ? "bg-emerald-500" : "bg-primary"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => (
              <Reveal key={keyOf(item)} delay={Math.min(idx * 60, 240)}>
                <div className="group flex gap-4 rounded-2xl border border-border bg-card p-4 shadow-card transition-colors duration-200">
                  <Link
                    href={`/products/${item.id}`}
                    className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border sm:h-28 sm:w-28"
                  >
                    {item.image_key ? (
                      <Image src={item.image_key} alt={item.title} fill sizes="112px" className="object-cover transition-transform duration-200" />
                    ) : (
                      <ProductThumb type={item.type} sizes="112px" />
                    )}
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/products/${item.id}`}
                          className="line-clamp-2 font-display text-[15px] font-medium leading-snug transition-colors hover:text-primary"
                        >
                          {item.title}
                        </Link>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {item.variant_name && (
                            <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                              {item.variant_name}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-2 py-1 text-[11px] font-medium text-primary">
                            {item.type === "physical" ? <Package className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                            {t(`product.type.${item.type}`)}
                          </span>
                        </div>
                        <p className="mt-2 font-mono text-[12.5px] text-muted-foreground">
                          {formatPrice(item.price)} {t("cart.each")}
                        </p>
                      </div>
                      <button
                        onClick={() => removeWithUndo(item)}
                        aria-label={t("cart.remove")}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="inline-flex items-center rounded-md border border-border bg-muted/50 p-1">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1, item.variant_id || undefined, item.delivery_method || undefined)}
                          aria-label={t("cart.decrease")}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:opacity-40"
                          disabled={item.quantity <= 1}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-9 text-center font-mono text-[13px] font-medium tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1, item.variant_id || undefined, item.delivery_method || undefined)}
                          aria-label={t("cart.increase")}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="font-display text-lg font-medium tabular-nums">
                        {formatPrice(item.price * item.quantity)}
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <Button asChild variant="ghost" className="mt-5 text-muted-foreground">
            <Link href="/products">
              <ArrowLeft className="mr-1 h-4 w-4" />
              {t("cart.continue_shopping")}
            </Link>
          </Button>
        </div>

        {/* ── Summary ── */}
        <div className="lg:col-span-4">
          <div className="sticky top-24 overflow-hidden rounded-3xl border border-border bg-card shadow-lift">
            <div className="border-b border-border bg-muted/40 px-6 py-4">
              <h2 className="font-display text-base font-medium">
                {t("cart.order_summary")}
              </h2>
            </div>
            <div className="p-6">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("cart.subtotal")}</span>
                  <span className="font-mono font-medium tabular-nums">{formatPrice(total)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("cart.shipping")}</span>
                  <span className={cn("font-medium", remaining === 0 && "text-emerald-600 dark:text-emerald-400")}>
                    {remaining === 0 ? t("cart.shipping_free") : t("cart.shipping_at_checkout")}
                  </span>
                </div>
              </div>

              <div className="my-5 h-px bg-border" />

              <div className="flex items-end justify-between">
                <span className="text-sm font-medium">{t("cart.estimated_total")}</span>
                <span className="font-display text-3xl font-medium tabular-nums">
                  {formatPrice(total)}
                </span>
              </div>

              <Button size="lg" className="mt-6 w-full" onClick={() => router.push("/checkout")}>
                {t("cart.checkout")}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>

              <div className="mt-5 space-y-2 text-[12.5px] text-muted-foreground">
                <p className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" weight="fill" />
                  {t("cart.secure_checkout")}
                </p>
                <p className="flex items-center gap-2">
                  <ArrowCounterClockwise className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  {t("product.refund_7day")}
                </p>
                <p className="flex items-center gap-2">
                  <Truck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  {t("product.tracked_shipping")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Cross-sell ── */}
      {crossSell.length > 0 && (
        <div className="mt-16 border-t border-border pt-12">
          <h2 className="mb-5 font-display text-xl font-medium">
            {t("cart.recommend_title")}
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {crossSell.map((p, i) => (
              <Reveal key={p.id} delay={i * 70}>
                <Link href={`/products/${p.id}`} className="group block">
                  <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-colors duration-200">
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <ProductThumb type={p.type} image={p.image_key} alt={loc(p)} sizes="(min-width:1024px) 22vw, 50vw" />
                    </div>
                    <div className="p-4">
                      <p className="line-clamp-1 text-[13.5px] font-medium transition-colors group-hover:text-primary">{loc(p)}</p>
                      <p className="mt-1 font-mono text-sm font-medium">{formatPrice(Number(p.price))}</p>
                    </div>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}