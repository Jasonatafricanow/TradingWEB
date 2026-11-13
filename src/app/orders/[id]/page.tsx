"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import { useI18n } from "@/contexts/i18n-context"
import { useAuth } from "@/contexts/auth-context"
import { useCurrency } from "@/contexts/currency-context"
import { apiFetch, openAuthenticatedHtml } from "@/lib/client-api"
import { formatDate, getOrderStatusLabel, translate } from "@/i18n"
import { canCancelPendingOrder, canRepayOrder, getRepaymentProvider } from "@/lib/order-payment"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog"
import Link from "next/link"
import { toast } from "sonner"
import { ProductThumb } from "@/components/product-thumb"
import { Reveal } from "@/components/reveal"
import { BreadcrumbPublic } from "@/components/breadcrumb-public"
import { cn } from "@/lib/utils"
import {
  ArrowLeft, Clock, CreditCard, FileText, Package, Spinner, WarningCircle,
  CheckCircle, Truck, Receipt, ArrowCounterClockwise, ShieldCheck, Envelope, MapPin,
} from "@phosphor-icons/react"

interface OrderDetailItem {
  id: string
  product_id?: string | null
  product_title?: string | null
  product_type?: string | null
  quantity?: number | null
  unit_price?: string | number | null
  subtotal?: string | number | null
  image_key?: string | null
  sku?: string | null
}

interface TimelineEntry {
  id: string
  action: string
  description: string
  created_at: string
}

interface OrderDetail {
  id: string
  order_no?: string | null
  subtotal?: string | number | null
  total_amount?: string | number | null
  discount_amount?: string | number | null
  shipping_cost?: string | number | null
  currency?: string | null
  status: string
  payment_status?: string | null
  financial_status?: string | null
  payment_method?: string | null
  buyer_email?: string | null
  buyer_name?: string | null
  buyer_phone?: string | null
  coupon_code?: string | null
  created_at: string
  paid_at?: string | null
  has_refund?: boolean | null
  order_items?: OrderDetailItem[]
  timeline?: TimelineEntry[]
}

const STATUS_STYLE: Record<string, { cls: string; icon: React.ReactNode }> = {
  pending: { cls: "bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/25", icon: <Clock className="h-3.5 w-3.5" /> },
  paid: { cls: "bg-sky-500/12 text-sky-700 dark:text-sky-400 border-sky-500/25", icon: <CheckCircle className="h-3.5 w-3.5" weight="fill" /> },
  processing: { cls: "bg-sky-500/12 text-sky-700 dark:text-sky-400 border-sky-500/25", icon: <Clock className="h-3.5 w-3.5" /> },
  shipped: { cls: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-400 border-indigo-500/25", icon: <Truck className="h-3.5 w-3.5" /> },
  delivering: { cls: "bg-violet-500/12 text-violet-700 dark:text-violet-400 border-violet-500/25", icon: <Truck className="h-3.5 w-3.5" /> },
  delivered: { cls: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/25", icon: <CheckCircle className="h-3.5 w-3.5" weight="fill" /> },
  completed: { cls: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/25", icon: <CheckCircle className="h-3.5 w-3.5" weight="fill" /> },
  cancelled: { cls: "bg-rose-500/12 text-rose-700 dark:text-rose-400 border-rose-500/25", icon: <WarningCircle className="h-3.5 w-3.5" /> },
  refunded: { cls: "bg-muted text-muted-foreground border-border", icon: <ArrowCounterClockwise className="h-3.5 w-3.5" /> },
}

function toAmount(value?: string | number | null): number {
  const amount = typeof value === "number" ? value : Number.parseFloat(value || "0")
  return Number.isFinite(amount) ? amount : 0
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { locale, t } = useI18n()
  const { loading: authLoading } = useAuth()
  const { format } = useCurrency()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refundReason, setRefundReason] = useState("")
  const [refunding, setRefunding] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [paying, setPaying] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const loadOrder = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/orders/${id}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setOrder(json.data || json.order)
    } catch {
      toast.error(t("order_detail.load_failed"))
    } finally {
      setLoading(false)
    }
  }, [id, t])

  useEffect(() => { if (id && !authLoading) void loadOrder() }, [id, authLoading, loadOrder])

  const handleRefund = async () => {
    if (!refundReason.trim()) {
      toast.error(t("order_detail.refund_reason_required"))
      return
    }
    setRefunding(true)
    try {
      const res = await apiFetch("/api/refunds", {
        method: "POST",
        body: JSON.stringify({ order_id: id, reason: refundReason, amount: order?.total_amount }),
      })
      if (!res.ok) throw new Error()
      toast.success(t("order_detail.refund_submitted"))
      setRefundOpen(false)
      setRefundReason("")
      void loadOrder()
    } catch {
      toast.error(t("order_detail.refund_failed"))
    } finally {
      setRefunding(false)
    }
  }

  const handleOpenInvoice = async () => {
    const target = window.open("", "_blank")
    try {
      await openAuthenticatedHtml(`/api/orders/${id}/invoice`, target)
    } catch {
      toast.error(translate(locale, "orders.invoice_load_failed"))
    }
  }

  const handleRepay = async () => {
    if (!order) return
    const provider = getRepaymentProvider(order)
    if (!provider) {
      toast.error(t("orders.cannot_repay"))
      return
    }
    setPaying(true)
    try {
      const res = await apiFetch("/api/payment/create", {
        method: "POST",
        body: JSON.stringify({ provider, orderId: order.id }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || "Payment creation failed")
      if (json.data?.approvalUrl) {
        window.location.href = json.data.approvalUrl
        return
      }
      if (json.data?.message?.includes("Mock")) {
        router.push(`/checkout/success?mock=1&order_id=${order.id}`)
        return
      }
      throw new Error(json.data?.message || "Payment creation failed")
    } catch {
      toast.error(t("orders.payment_create_failed"))
    } finally {
      setPaying(false)
    }
  }

  const handleCancel = async () => {
    if (!order) return
    const confirmed = window.confirm(
      locale === "zh"
        ? `确定取消订单 ${order.order_no || order.id} 吗？`
        : `Cancel order ${order.order_no || order.id}?`,
    )
    if (!confirmed) return
    setCancelling(true)
    try {
      const res = await apiFetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || "Order cancellation failed")
      toast.success(t("orders.cancelled"))
      await loadOrder()
    } catch {
      toast.error(t("orders.cancel_failed"))
    } finally {
      setCancelling(false)
    }
  }

  if (loading || authLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
        <div className="mt-6 h-10 w-64 animate-pulse rounded-md bg-muted" />
        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-8">
            <div className="h-40 animate-pulse rounded-3xl bg-muted" />
            <div className="h-64 animate-pulse rounded-3xl bg-muted" />
          </div>
          <div className="h-80 animate-pulse rounded-3xl bg-muted lg:col-span-4" />
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Receipt className="h-8 w-8" weight="duotone" />
        </span>
        <h1 className="mt-6 font-display text-2xl font-medium">{t("order_detail.not_found")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("order_detail.not_found_desc")}</p>
        <Button asChild size="lg" className="mt-7">
          <Link href="/orders">{t("order_detail.back")}</Link>
        </Button>
      </div>
    )
  }

  const items = order.order_items || []
  const totalAmount = toAmount(order.total_amount)
  const discountAmount = toAmount(order.discount_amount)
  const shippingAmount = toAmount(order.shipping_cost)
  const subtotalAmount = order.subtotal != null
    ? toAmount(order.subtotal)
    : items.reduce((s, i) => s + toAmount(i.subtotal), 0)
  const style = STATUS_STYLE[order.status] || STATUS_STYLE.refunded
  const timeline = order.timeline || []
  const canInvoice = order.status === "paid" || order.status === "completed" || order.payment_status === "paid"
  const canRefund = (order.status === "paid" || order.status === "processing") && !order.has_refund

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <BreadcrumbPublic items={[{ label: t("orders.title"), href: "/orders" }, { label: order.order_no || order.id }]} />

      {/* Header */}
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon-sm" asChild className="mt-1 shrink-0">
            <Link href="/orders" aria-label={t("order_detail.back")}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="font-display text-2xl font-medium sm:text-3xl">
              {t("order_detail.title")}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex items-center gap-2 rounded-md border px-3 py-1 text-[11.5px] font-medium", style.cls)}>
                {style.icon}
                {getOrderStatusLabel(locale, order.status)}
              </span>
              <span className="font-mono text-[12.5px] font-medium">{order.order_no || order.id}</span>
              <span className="text-[12px] text-muted-foreground">
                {formatDate(locale, new Date(order.created_at), { timeZone: "UTC" })}
              </span>
            </div>
          </div>
        </div>
        {order.has_refund && (
          <span className="inline-flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
            <ArrowCounterClockwise className="h-3.5 w-3.5" />
            {t("order_detail.refunded_badge")}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        {/* Left */}
        <div className="space-y-5 lg:col-span-8">
          {/* Items */}
          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
              <h2 className="font-display text-base font-medium">{t("order_detail.items")}</h2>
              <span className="text-[12px] text-muted-foreground">
                {items.length} {t("orders.kinds")}
              </span>
            </div>
            <div className="divide-y divide-border-subtle">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                    {item.image_key
                      ? <Image src={item.image_key} alt={item.product_title || ""} fill sizes="64px" className="object-cover" />
                      : <ProductThumb type={item.product_type || "virtual"} sizes="64px" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    {item.product_id ? (
                      <Link href={`/products/${item.product_id}`} className="line-clamp-2 text-[14px] font-medium transition-colors hover:text-primary">
                        {item.product_title || "-"}
                      </Link>
                    ) : (
                      <p className="line-clamp-2 text-[14px] font-medium">{item.product_title || "-"}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-primary-soft px-2 py-1 text-[11px] font-medium text-primary">
                        {t(`product.type.${item.product_type || "virtual"}`)}
                      </span>
                      {item.sku && (
                        <span className="font-mono text-[11px] text-muted-foreground">{item.sku}</span>
                      )}
                      <span className="text-[11.5px] text-muted-foreground">× {item.quantity ?? 1}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[14px] font-medium tabular-nums">{format(toAmount(item.subtotal))}</p>
                    {item.unit_price != null && (
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">{format(toAmount(item.unit_price))} {t("cart.each")}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline */}
          {timeline.length > 0 && (
            <Reveal>
              <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
                <h2 className="mb-5 font-display text-base font-medium">{t("order_detail.timeline")}</h2>
                <ol className="relative space-y-5 border-l border-border pl-6">
                  {timeline.map((entry, i) => {
                    const last = i === timeline.length - 1
                    return (
                      <li key={entry.id} className="relative">
                        <span className={cn("absolute -left-[1.9rem] top-1 flex h-4 w-4 items-center justify-center rounded-md border-2 border-card",
                          last ? "bg-primary" : "bg-border-strong"
                        )} aria-hidden="true" />
                        <p className={cn("text-[13.5px] font-medium", last && "text-primary")}>{entry.description}</p>
                        <p className="mt-1 text-[11.5px] text-muted-foreground">
                          {formatDate(locale, new Date(entry.created_at), { timeZone: "UTC" })}
                        </p>
                      </li>
                    )
                  })}
                </ol>
              </div>
            </Reveal>
          )}

          {/* Contact */}
          {(order.buyer_email || order.buyer_phone) && (
            <Reveal delay={80}>
              <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
                <h2 className="mb-4 font-display text-base font-medium">{t("order_detail.contact")}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {order.buyer_name && (
                    <div className="flex items-center gap-2 rounded-2xl bg-muted/50 px-4 py-3">
                      <MapPin className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate text-[13px]">{order.buyer_name}</span>
                    </div>
                  )}
                  {order.buyer_email && (
                    <div className="flex items-center gap-2 rounded-2xl bg-muted/50 px-4 py-3">
                      <Envelope className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate text-[13px]">{order.buyer_email}</span>
                    </div>
                  )}
                  {order.buyer_phone && (
                    <div className="flex items-center gap-2 rounded-2xl bg-muted/50 px-4 py-3">
                      <CreditCard className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate font-mono text-[12.5px]">{order.buyer_phone}</span>
                    </div>
                  )}
                </div>
              </div>
            </Reveal>
          )}
        </div>

        {/* Right: payment summary + actions */}
        <div className="lg:col-span-4">
          <div className="sticky top-24 space-y-4">
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-lift">
              <div className="border-b border-border bg-muted/40 px-6 py-4">
                <h2 className="font-display text-base font-medium">{t("order_detail.payment")}</h2>
              </div>
              <div className="p-6">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("cart.subtotal")}</span>
                    <span className="font-mono tabular-nums">{format(subtotalAmount)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                      <span>{t("checkout.discount")}{order.coupon_code ? ` · ${order.coupon_code}` : ""}</span>
                      <span className="font-mono tabular-nums">-{format(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("cart.shipping")}</span>
                    <span className={cn("font-mono tabular-nums", shippingAmount === 0 && "text-emerald-600 dark:text-emerald-400")}>
                      {shippingAmount === 0 ? t("cart.shipping_free") : format(shippingAmount)}
                    </span>
                  </div>
                </div>

                <div className="my-4 h-px bg-border" />

                <div className="flex items-end justify-between">
                  <span className="text-sm font-medium">{t("cart.total")}</span>
                  <span className="font-display text-3xl font-medium tabular-nums">{format(totalAmount)}</span>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-2xl bg-muted/50 px-4 py-3 text-[12.5px]">
                  <span className="text-muted-foreground">{t("orders.payment_label")}</span>
                  <span className="font-medium">{(order.payment_method || "paypal").replace(/_/g, " ")}</span>
                </div>

                <div className="mt-5 space-y-2">
                  {canRepayOrder(order) && (
                    <Button size="lg" onClick={handleRepay} disabled={paying} className="w-full">
                      {paying ? <Spinner className="mr-1.5 h-4 w-4 animate-spin" /> : <CreditCard className="mr-1.5 h-4 w-4" />}
                      {t("orders.pay_now")}
                    </Button>
                  )}
                  {canInvoice && (
                    <Button variant="outline" size="lg" className="w-full" onClick={handleOpenInvoice}>
                      <FileText className="mr-1.5 h-4 w-4" />
                      {t("order_detail.invoice")}
                    </Button>
                  )}
                  {canRefund && (
                    <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="lg" className="w-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                          <ArrowCounterClockwise className="mr-1.5 h-4 w-4" />
                          {t("order_detail.refund")}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="rounded-3xl">
                        <DialogHeader>
                          <DialogTitle className="font-display">{t("order_detail.refund")}</DialogTitle>
                          <DialogDescription className="text-[13px]">
                            {t("order_detail.refund_dialog_desc")}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>{t("order_detail.refund_reason")}</Label>
                            <Textarea
                              value={refundReason}
                              onChange={(e) => setRefundReason(e.target.value)}
                              placeholder={t("order_detail.refund_placeholder")}
                              rows={4}
                              className="rounded-xl"
                            />
                          </div>
                          <div className="flex items-center justify-between rounded-2xl bg-muted/50 px-4 py-3">
                            <span className="text-[13px] text-muted-foreground">{t("order_detail.refund_amount")}</span>
                            <span className="font-display text-lg font-medium tabular-nums">{format(totalAmount)}</span>
                          </div>
                          <Button onClick={handleRefund} disabled={refunding} size="lg" className="w-full">
                            {refunding ? <Spinner className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                            {refunding ? t("order_detail.refund_submitting") : t("order_detail.refund_submit")}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                  {canCancelPendingOrder(order) && (
                    <Button
                      variant="ghost"
                      size="lg"
                      onClick={handleCancel}
                      disabled={cancelling || paying}
                      className="w-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      {cancelling ? <Spinner className="mr-1.5 h-4 w-4 animate-spin" /> : <WarningCircle className="mr-1.5 h-4 w-4" />}
                      {t("orders.cancel")}
                    </Button>
                  )}
                </div>

                <div className="mt-5 space-y-2 text-[12px] text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" weight="fill" />
                    {t("product.payment_secure")}
                  </p>
                  <p className="flex items-center gap-2">
                    <ArrowCounterClockwise className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    {t("product.refund_7day")}
                  </p>
                </div>
              </div>
            </div>

            <Button asChild variant="outline" className="w-full">
              <Link href="/products">
                <Package className="mr-1.5 h-4 w-4" />
                {t("success.continue")}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}