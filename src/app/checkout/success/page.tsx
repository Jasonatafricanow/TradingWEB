"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { apiFetch } from "@/lib/client-api";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { useCurrency } from "@/contexts/currency-context";
import { Button } from "@/components/ui/button";
import { ProductThumb } from "@/components/product-thumb";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/utils";
import {
  CheckCircle, Package, Clock, ArrowRight, Truck, Envelope,
  Receipt, ShieldCheck, Spinner, WarningCircle, CreditCard,
} from "@phosphor-icons/react";

interface OrderItem {
  id: string;
  product_id?: string;
  product_title: string;
  product_type: string;
  quantity: number;
  subtotal: string;
  image_key?: string | null;
}

interface Order {
  id: string;
  order_no?: string | null;
  total_amount: string | number;
  currency?: string | null;
  status: string;
  payment_method?: string | null;
  payment_status?: string | null;
  created_at: string;
  order_items?: OrderItem[];
}

type Status = "loading" | "paid" | "pending" | "unknown";

export default function CheckoutSuccessPage() {
  const { t, locale } = useI18n();
  const { format } = useCurrency();
  const { loading: authLoading, user } = useAuth();
  const [status, setStatus] = useState<Status>("loading");
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    // 令牌恢复完成后再请求，否则会因未鉴权而落入未知状态
    if (authLoading) return;
    let active = true;
    const id = new URLSearchParams(window.location.search).get("order_id");
    if (!id) { setStatus("unknown"); return; }
    if (!user) { setStatus("unknown"); return; }
    apiFetch(`/api/orders/${encodeURIComponent(id)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Order unavailable");
        const json = await response.json();
        if (!active) return;
        const data = json.data as Order | undefined;
        setOrder(data ?? null);
        setStatus(data?.payment_status === "paid" ? "paid" : "pending");
      })
      .catch(() => { if (active) setStatus("unknown"); });
    return () => { active = false; };
  }, [authLoading, user]);

  const paid = status === "paid";
  const items = order?.order_items ?? [];

  const nextSteps = paid
    ? [
        { Icon: Envelope, title: t("success.step.confirm.title"), desc: t("success.step.confirm.desc") },
        { Icon: Truck, title: t("success.step.fulfil.title"), desc: t("success.step.fulfil.desc") },
        { Icon: Receipt, title: t("success.step.invoice.title"), desc: t("success.step.invoice.desc") },
      ]
    : [
        { Icon: CreditCard, title: t("success.step.pay.title"), desc: t("success.step.pay.desc") },
        { Icon: Envelope, title: t("success.step.contact.title"), desc: t("success.step.contact.desc") },
        { Icon: Package, title: t("success.step.track.title"), desc: t("success.step.track.desc") },
      ];

  return (
    <div className="relative overflow-hidden">

      <div className="relative mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
        {/* Status hero */}
        <div className="text-center">
          <span
            className={cn("mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border shadow-lift",
              status === "loading"
                ? "border-border bg-card text-muted-foreground"
                : paid
                  ? "border-emerald-500/30 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                  : status === "pending"
                    ? "border-amber-500/30 bg-amber-500/12 text-amber-600 dark:text-amber-400"
                    : "border-border bg-card text-muted-foreground"
            )}
          >
            {status === "loading" ? (
              <Spinner className="h-9 w-9 animate-spin" />
            ) : paid ? (
              <CheckCircle className="h-10 w-10" weight="fill" />
            ) : status === "pending" ? (
              <Clock className="h-10 w-10" weight="duotone" />
            ) : (
              <WarningCircle className="h-10 w-10" weight="duotone" />
            )}
          </span>

          <h1 className="mt-7 font-display text-balance text-3xl font-medium sm:text-4xl">
            {status === "loading"
              ? t("success.checking")
              : paid
                ? t("success.paid_title")
                : status === "pending"
                  ? t("success.pending_title")
                  : t("success.unknown_title")}
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            {status === "loading"
              ? t("success.checking_desc")
              : paid
                ? t("success.paid_desc")
                : status === "pending"
                  ? t("success.pending_desc")
                  : t("success.unknown_desc")}
          </p>

          {order?.order_no && (
            <div className="mt-6 inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 shadow-card">
              <span className="text-[11px] text-muted-foreground">
                {t("orders.order_label")}
              </span>
              <span className="font-mono text-[13px] font-medium">{order.order_no}</span>
            </div>
          )}

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/orders">
                <Package className="mr-1 h-4 w-4" />
                {t("success.view_orders")}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/products">
                {t("success.continue")}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Order summary */}
        {order && items.length > 0 && (
          <Reveal className="mt-14">
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-6 py-4">
                <h2 className="font-display text-base font-medium">
                  {t("success.summary")}
                </h2>
                <span className="text-[12px] text-muted-foreground">
                  {items.length} {t("orders.kinds")} · {(order.payment_method || "paypal").replace(/_/g, " ")}
                </span>
              </div>
              <div className="divide-y divide-border-subtle">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 px-6 py-4">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                      {item.image_key
                        ? <Image src={item.image_key} alt={item.product_title} fill sizes="56px" className="object-cover" />
                        : <ProductThumb type={item.product_type} sizes="56px" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      {item.product_id ? (
                        <Link href={`/products/${item.product_id}`} className="line-clamp-1 text-[14px] font-medium transition-colors hover:text-primary">
                          {item.product_title}
                        </Link>
                      ) : (
                        <p className="line-clamp-1 text-[14px] font-medium">{item.product_title}</p>
                      )}
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        {t(`product.type.${item.product_type}`)} × {item.quantity}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[13.5px] font-medium tabular-nums">
                      {format(Number(item.subtotal || 0))}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-end justify-between border-t border-border bg-muted/40 px-6 py-5">
                <span className="text-sm font-medium">{t("cart.total")}</span>
                <span className="font-display text-2xl font-medium tabular-nums">
                  {format(Number(order.total_amount))}
                </span>
              </div>
            </div>
          </Reveal>
        )}

        {/* Next steps */}
        {status !== "loading" && (
          <div className="mt-12">
            <h2 className="mb-5 text-center font-display text-lg font-medium">
              {t("success.next_title")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {nextSteps.map((s, i) => (
                <Reveal key={s.title} delay={i * 80}>
                  <div className="h-full rounded-2xl border border-border bg-card p-5 shadow-card transition-colors duration-200">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <s.Icon className="h-5 w-5" weight="duotone" />
                    </span>
                    <h3 className="mt-4 font-display text-[14.5px] font-medium">{s.title}</h3>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{s.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        )}

        <p className="mt-10 flex items-center justify-center gap-2 text-[12.5px] text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" weight="fill" />
          {t("success.footer_note")}
          <Link href="/contact" className="font-medium text-primary hover:underline">
            {t("footer.contact")}
          </Link>
        </p>
      </div>
    </div>
  );
}