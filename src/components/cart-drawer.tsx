"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ShoppingCart, Minus, Plus, Trash, ArrowRight, Truck } from "@phosphor-icons/react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useUI } from "@/contexts/ui-context";
import { useCart } from "@/contexts/cart-context";
import { useCurrency } from "@/contexts/currency-context";
import { useI18n } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";

const FREE_SHIPPING_AT = 300;

export function CartDrawer() {
  const { cartOpen, setCartOpen } = useUI();
  const { items, count, total, updateQuantity, removeItem } = useCart();
  const { format } = useCurrency();
  const { t } = useI18n();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const remaining = Math.max(0, FREE_SHIPPING_AT - total);
  const progress = Math.min(100, (total / FREE_SHIPPING_AT) * 100);

  const goCheckout = () => {
    setCartOpen(false);
    router.push("/checkout");
  };

  return (
    <Sheet open={cartOpen} onOpenChange={setCartOpen}>
      <SheetContent
        side="right"
        title={t("cart.title")}
        className="flex w-full flex-col gap-0 border-l border-border bg-card p-0 sm:max-w-md"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <SheetTitle className="font-display text-base font-medium">
            {t("cart.title")}
            {mounted && count > 0 && (
              <span className="manifest-line ml-2">{count} {t("cart.items_count")}</span>
            )}
          </SheetTitle>
        </div>

        {!mounted || items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <ShoppingCart className="h-6 w-6" />
            </span>
            <p className="mt-5 text-[15px] font-medium">{t("cart.empty")}</p>
            <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
              {t("cart.empty_desc")}
            </p>
            <Button asChild className="mt-6" onClick={() => setCartOpen(false)}>
              <Link href="/products">
                {t("home.hero.cta.primary")}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        ) : (
          <>
            {/* 免运进度 */}
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-center gap-2 text-[12.5px]">
                <Truck className={cn("h-4 w-4 shrink-0", remaining === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")} />
                <span className={cn(remaining === 0 && "text-emerald-600 dark:text-emerald-400")}>
                  {remaining === 0
                    ? t("cart.free_shipping_unlocked")
                    : `${t("cart.free_shipping_progress")} ${format(remaining)}`}
                </span>
              </div>
              <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-[width] duration-500 ease-out", remaining === 0 ? "bg-emerald-500" : "bg-primary")}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <ul className="space-y-3">
                {items.map((item) => {
                  const key = [item.id, item.variant_id || "", item.delivery_method || ""].join("::");
                  return (
                    <li key={key} className="flex gap-3 rounded-xl border border-border p-3">
                      <Link
                        href={`/products/${item.id}`}
                        onClick={() => setCartOpen(false)}
                        className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
                      >
                        {item.image_key && (
                          <Image src={item.image_key} alt={item.title} fill sizes="64px" className="object-cover" />
                        )}
                      </Link>
                      <div className="flex min-w-0 flex-1 flex-col justify-between">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link
                              href={`/products/${item.id}`}
                              onClick={() => setCartOpen(false)}
                              className="line-clamp-1 text-[13px] font-medium transition-colors hover:text-primary"
                            >
                              {item.title}
                            </Link>
                            {item.variant_name && (
                              <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{item.variant_name}</p>
                            )}
                          </div>
                          <button
                            onClick={() => removeItem(item.id, item.variant_id || undefined, item.delivery_method || undefined)}
                            aria-label={t("cart.remove")}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="inline-flex items-center rounded-md border border-border">
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity - 1, item.variant_id || undefined, item.delivery_method || undefined)}
                              disabled={item.quantity <= 1}
                              aria-label={t("cart.decrease")}
                              className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-7 text-center font-mono text-[12px] tabular-nums">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity + 1, item.variant_id || undefined, item.delivery_method || undefined)}
                              aria-label={t("cart.increase")}
                              className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <span className="text-[13px] font-medium tabular-nums">
                            {format(item.price * item.quantity)}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="border-t border-border px-5 py-4">
              <div className="flex items-end justify-between">
                <span className="text-[13px] text-muted-foreground">{t("cart.subtotal")}</span>
                <span className="font-display text-2xl font-medium tabular-nums">{format(total)}</span>
              </div>
              <p className="mt-1 text-[11.5px] text-muted-foreground">{t("cart.shipping_at_checkout")}</p>
              <Button size="lg" className="mt-4 w-full" onClick={goCheckout}>
                {t("cart.checkout")}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
              <Button asChild variant="ghost" className="mt-2 w-full text-muted-foreground" onClick={() => setCartOpen(false)}>
                <Link href="/cart">{t("command.view_cart")}</Link>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}