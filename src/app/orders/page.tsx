"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useI18n } from "@/contexts/i18n-context";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/client-api";
import { canCancelPendingOrder, canRepayOrder, getRepaymentProvider } from "@/lib/order-payment";
import { Button } from "@/components/ui/button";
import { ProductThumb } from "@/components/product-thumb";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/utils";
import {
  CheckCircle, Clock, CreditCard, Eye, Package, Spinner, XCircle,
  Truck, ArrowRight, MagnifyingGlass, CaretDown, Wallet, Receipt, ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { BreadcrumbPublic } from "@/components/breadcrumb-public";
import {
  formatDate,
  formatOrderCancelConfirmation,
  formatOrderMoney,
  getOrderStatusLabel,
  translate,
} from "@/i18n";

interface OrderItem {
  id: string;
  product_id?: string;
  product_title: string;
  product_type: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
  image_key?: string | null;
}

interface Order {
  id: string;
  order_no?: string | null;
  user_id: string;
  total_amount: number | string;
  currency?: string | null;
  status: string;
  payment_method: string | null;
  payment_status: string | null;
  financial_status?: string | null;
  created_at: string;
  updated_at: string;
  order_items: OrderItem[];
}

const STATUS_STYLE: Record<string, { cls: string; icon: React.ReactNode }> = {
  pending: { cls: "bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/25", icon: <Clock className="h-3.5 w-3.5" /> },
  paid: { cls: "bg-sky-500/12 text-sky-700 dark:text-sky-400 border-sky-500/25", icon: <CheckCircle className="h-3.5 w-3.5" weight="fill" /> },
  processing: { cls: "bg-sky-500/12 text-sky-700 dark:text-sky-400 border-sky-500/25", icon: <Clock className="h-3.5 w-3.5" /> },
  shipped: { cls: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-400 border-indigo-500/25", icon: <Truck className="h-3.5 w-3.5" /> },
  delivering: { cls: "bg-violet-500/12 text-violet-700 dark:text-violet-400 border-violet-500/25", icon: <Truck className="h-3.5 w-3.5" /> },
  delivered: { cls: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/25", icon: <CheckCircle className="h-3.5 w-3.5" weight="fill" /> },
  delivery_failed: { cls: "bg-rose-500/12 text-rose-700 dark:text-rose-400 border-rose-500/25", icon: <XCircle className="h-3.5 w-3.5" /> },
  completed: { cls: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/25", icon: <CheckCircle className="h-3.5 w-3.5" weight="fill" /> },
  cancelled: { cls: "bg-rose-500/12 text-rose-700 dark:text-rose-400 border-rose-500/25", icon: <XCircle className="h-3.5 w-3.5" /> },
  refunded: { cls: "bg-muted text-muted-foreground border-border", icon: <ArrowCounterClockwise className="h-3.5 w-3.5" /> },
};

const FILTERS = [
  { key: "all", labelKey: "orders.filter.all" },
  { key: "pending", labelKey: "orders.filter.pending" },
  { key: "active", labelKey: "orders.filter.active" },
  { key: "completed", labelKey: "orders.filter.completed" },
  { key: "closed", labelKey: "orders.filter.closed" },
] as const;

const ACTIVE_STATUSES = ["paid", "processing", "shipped", "delivering", "delivered"];
const CLOSED_STATUSES = ["cancelled", "refunded", "delivery_failed"];

export default function OrdersPage() {
  const { locale, t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    fetchOrders();
  }, [user]);

  async function fetchOrders() {
    try {
      const res = await apiFetch("/api/orders");
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      setOrders(result.data || []);
    } catch (err) {
      console.error("Failed to fetch orders:", err);
      toast.error(t("common.unexpected_error"));
    } finally {
      setLoading(false);
    }
  }

  function orderDisplayNo(order: Order): string {
    return order.order_no || order.id.slice(0, 8).toUpperCase();
  }

  async function handleRepay(order: Order) {
    const provider = getRepaymentProvider(order);
    if (!provider) {
      toast.error(t("orders.cannot_repay"));
      return;
    }
    setPayingOrderId(order.id);
    try {
      const res = await apiFetch("/api/payment/create", {
        method: "POST",
        body: JSON.stringify({ provider, orderId: order.id }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error("PAYMENT_CREATE_FAILED");
      if (json.data?.approvalUrl) {
        window.location.href = json.data.approvalUrl;
        return;
      }
      if (json.data?.message?.includes("Mock")) {
        router.push(`/checkout/success?mock=1&order_id=${order.id}`);
        return;
      }
      throw new Error("PAYMENT_CREATE_FAILED");
    } catch {
      toast.error(t("orders.payment_create_failed"));
    } finally {
      setPayingOrderId(null);
    }
  }

  async function handleCancel(order: Order) {
    const confirmed = window.confirm(formatOrderCancelConfirmation(locale, orderDisplayNo(order)));
    if (!confirmed) return;
    setCancellingOrderId(order.id);
    try {
      const res = await apiFetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error("ORDER_CANCEL_FAILED");
      toast.success(t("orders.cancelled"));
      await fetchOrders();
    } catch {
      toast.error(t("orders.cancel_failed"));
    } finally {
      setCancellingOrderId(null);
    }
  }

  const counts = useMemo(() => ({
    all: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    active: orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length,
    completed: orders.filter((o) => o.status === "completed").length,
    closed: orders.filter((o) => CLOSED_STATUSES.includes(o.status)).length,
  }), [orders]);

  const visible = useMemo(() => {
    let list = orders;
    if (filter === "pending") list = list.filter((o) => o.status === "pending");
    else if (filter === "active") list = list.filter((o) => ACTIVE_STATUSES.includes(o.status));
    else if (filter === "completed") list = list.filter((o) => o.status === "completed");
    else if (filter === "closed") list = list.filter((o) => CLOSED_STATUSES.includes(o.status));
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((o) =>
        orderDisplayNo(o).toLowerCase().includes(q) ||
        (o.order_items || []).some((i) => i.product_title.toLowerCase().includes(q))
      );
    }
    return list;
  }, [orders, filter, query]);

  const paidOrders = orders.filter((o) => o.payment_status === "paid");
  const totalSpent = paidOrders.reduce((s, o) => s + Number(o.total_amount), 0);
  const itemCount = orders.reduce((s, o) => s + (o.order_items || []).reduce((n, i) => n + i.quantity, 0), 0);

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Receipt className="h-8 w-8" weight="duotone" />
        </span>
        <h1 className="mt-6 font-display text-2xl font-medium sm:text-3xl">
          {t("orders.sign_in_required")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("orders.sign_in_desc")}</p>
        <Button asChild size="lg" className="mt-7">
          <Link href="/auth/login">{t("orders.sign_in")}</Link>
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />
        <div className="mt-6 grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}
        </div>
        <div className="mt-6 space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-44 animate-pulse rounded-3xl bg-muted" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <BreadcrumbPublic items={[{ label: t("orders.title") }]} />

      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium sm:text-4xl">
            {t("orders.title")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("orders.description")}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/products">
            {t("orders.shop_now")}
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {orders.length > 0 && (
        <>
          {/* Overview */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { Icon: Receipt, label: t("orders.stat.total"), value: String(orders.length) },
              { Icon: Wallet, label: t("orders.stat.spent"), value: formatOrderMoney(locale, totalSpent, paidOrders[0]?.currency) },
              { Icon: Package, label: t("orders.stat.items"), value: String(itemCount) },
            ].map((s, i) => (
              <Reveal key={s.label} delay={i * 70}>
                <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-card">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <s.Icon className="h-5 w-5" weight="duotone" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                    <p className="mt-1 truncate font-display text-xl font-medium tabular-nums">{s.value}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Filters + search */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/70 p-1">
              {FILTERS.map((f) => {
                const active = filter === f.key;
                const n = counts[f.key as keyof typeof counts];
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn("inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-[12.5px] font-medium transition-colors duration-200",
                      active ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t(f.labelKey)}
                    <span className={cn("rounded-md px-1.5 text-[11px] font-medium tabular-nums",
                      active ? "bg-primary-soft text-primary" : "bg-accent text-muted-foreground"
                    )}>{n}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative w-full sm:w-64">
              <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("orders.search_placeholder")}
                className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3.5 text-sm shadow-xs outline-none transition-colors duration-200 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
              />
            </div>
          </div>
        </>
      )}

      {orders.length === 0 ? (
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card px-6 py-16 text-center shadow-card">
          <div className="relative">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <Package className="h-8 w-8" weight="duotone" />
            </span>
            <p className="mt-6 font-display text-xl font-medium">{t("orders.empty")}</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{t("orders.empty_desc")}</p>
            <Button asChild size="lg" className="mt-7">
              <Link href="/products">
                {t("orders.shop_now")}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card py-16 text-center shadow-card">
          <p className="text-sm text-muted-foreground">{t("orders.no_match")}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => { setFilter("all"); setQuery(""); }}>
            {t("orders.reset_filters")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((order, idx) => {
            const style = STATUS_STYLE[order.status] || STATUS_STYLE.refunded;
            const expanded = expandedOrder === order.id;
            const items = order.order_items || [];
            return (
              <Reveal key={order.id} delay={Math.min(idx * 60, 240)}>
                <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card transition-shadow duration-200">
                  {/* Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("inline-flex items-center gap-2 rounded-md border px-3 py-1 text-[11.5px] font-medium", style.cls)}>
                        {style.icon}
                        {getOrderStatusLabel(locale, order.status)}
                      </span>
                      <span className="font-mono text-[12.5px] font-medium">{orderDisplayNo(order)}</span>
                      <span className="text-[12px] text-muted-foreground">
                        {formatDate(locale, new Date(order.created_at), { timeZone: "UTC" })}
                      </span>
                    </div>
                    <span className="text-[11.5px] text-muted-foreground">
                      {(order.payment_method || "paypal").replace(/_/g, " ")}
                    </span>
                  </div>

                  {/* Body */}
                  <div className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-5">
                      {/* Thumbnails */}
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex -space-x-3">
                          {items.slice(0, 3).map((item) => (
                            <div
                              key={item.id}
                              className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 border-card bg-muted shadow-card"
                            >
                              {item.image_key
                                ? <Image src={item.image_key} alt={item.product_title} fill sizes="56px" className="object-cover" />
                                : <ProductThumb type={item.product_type} sizes="56px" />}
                            </div>
                          ))}
                          {items.length > 3 && (
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-card bg-muted font-mono text-[12px] font-medium text-muted-foreground shadow-card">
                              +{items.length - 3}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="line-clamp-1 font-display text-[14.5px] font-medium">
                            {items[0]?.product_title || orderDisplayNo(order)}
                          </p>
                          <p className="mt-1 text-[12.5px] text-muted-foreground">
                            {items.length} {t("orders.kinds")} · {items.reduce((n, i) => n + i.quantity, 0)} {t("cart.items_count")}
                          </p>
                        </div>
                      </div>

                      {/* Amount + actions */}
                      <div className="flex flex-col items-end gap-3">
                        <span className="font-display text-2xl font-medium tabular-nums">
                          {formatOrderMoney(locale, Number(order.total_amount), order.currency)}
                        </span>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/orders/${order.id}`}>
                              <Eye className="h-3.5 w-3.5" />
                              {t("orders.view_details")}
                            </Link>
                          </Button>
                          {canRepayOrder(order) && (
                            <Button size="sm" onClick={() => handleRepay(order)} disabled={payingOrderId === order.id}>
                              {payingOrderId === order.id
                                ? <Spinner className="h-3.5 w-3.5 animate-spin" />
                                : <CreditCard className="h-3.5 w-3.5" />}
                              {t("orders.pay_now")}
                            </Button>
                          )}
                          {canCancelPendingOrder(order) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleCancel(order)}
                              disabled={cancellingOrderId === order.id || payingOrderId === order.id}
                            >
                              {cancellingOrderId === order.id
                                ? <Spinner className="h-3.5 w-3.5 animate-spin" />
                                : <XCircle className="h-3.5 w-3.5" />}
                              {t("orders.cancel")}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expand */}
                    <button
                      onClick={() => setExpandedOrder(expanded ? null : order.id)}
                      className="mt-4 inline-flex items-center gap-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                      aria-expanded={expanded}
                    >
                      <CaretDown className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded && "rotate-180")} />
                      {expanded ? t("orders.hide") : t("orders.details")}
                    </button>

                    {expanded && (
                      <div className="mt-4 space-y-2 border-t border-border pt-4">
                        {items.map((item) => (
                          <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3">
                            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-border">
                              {item.image_key
                                ? <Image src={item.image_key} alt={item.product_title} fill sizes="48px" className="object-cover" />
                                : <ProductThumb type={item.product_type} sizes="48px" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              {item.product_id ? (
                                <Link href={`/products/${item.product_id}`} className="line-clamp-1 text-[13.5px] font-medium transition-colors hover:text-primary">
                                  {item.product_title}
                                </Link>
                              ) : (
                                <p className="line-clamp-1 text-[13.5px] font-medium">{item.product_title}</p>
                              )}
                              <p className="mt-1 text-[11.5px] text-muted-foreground">
                                {translate(locale, "orders.item_quantity", { type: item.product_type, count: item.quantity })}
                              </p>
                            </div>
                            <span className="shrink-0 font-mono text-[13px] font-medium tabular-nums">
                              {formatOrderMoney(locale, Number(item.subtotal || 0), order.currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}