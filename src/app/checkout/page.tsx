"use client";

import { useEffect, useState } from "react";
import { checkoutIdempotencyKey } from "@/lib/checkout-attempt";
import { combineDiscounts, walletShareCents } from "@/services/promotions/money-rules";
import { readAffiliateRef } from "@/lib/affiliate-ref";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/contexts/cart-context";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { useCurrency } from "@/contexts/currency-context";
import { translate } from "@/i18n";
import { apiFetch } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ProductThumb } from "@/components/product-thumb";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, CreditCard, ShieldCheck, Spinner, Check, Truck,
  Wallet, Bank, HandCoins, Lock, Tag, ArrowCounterClockwise, UserCircle,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { BreadcrumbPublic } from "@/components/breadcrumb-public";

interface CheckoutZone {
  id: string; name: string; name_en: string | null;
  base_rate: string; free_shipping_min: string | null; time_slots: unknown;
}

const PAYMENT_ICON: Record<string, React.ReactNode> = {
  paypal: <Wallet className="h-5 w-5" weight="duotone" />,
  stripe: <CreditCard className="h-5 w-5" weight="duotone" />,
  bank_transfer: <Bank className="h-5 w-5" weight="duotone" />,
  cod: <HandCoins className="h-5 w-5" weight="duotone" />,
};

export default function CheckoutPage() {
  const { items, total, count, clearCart } = useCart();
  const { user, loading: authLoading } = useAuth();
  const { locale, t } = useI18n();
  const { format: formatPrice } = useCurrency();
  const router = useRouter();
  const [provider, setProvider] = useState<string>("paypal");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [mounted, setMounted] = useState(false);

  const isOfflineProvider = provider !== "paypal" && provider !== "stripe";
  const [offlineMethods, setOfflineMethods] = useState<Array<{ code: string; name: string; name_en: string | null }>>([]);
  const [methodsReady, setMethodsReady] = useState(false);
  const [zonesReady, setZonesReady] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // The sample coupon codes exist only in the in-memory demo store.
  const [demoMode, setDemoMode] = useState(false);
  useEffect(() => {
    fetch("/api/public/settings")
      .then(r => r.json())
      .then(j => setDemoMode(j.data?.demo === true))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/payment-methods")
      .then(r => r.json())
      .then(j => setOfflineMethods((j.data || []).filter((m: { code: string }) => m.code !== "paypal" && m.code !== "stripe")))
      .catch(() => {})
      .finally(() => setMethodsReady(true));
  }, []);

  // ── Coupon ──
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  // ── Member discount / wallet (programs an admin can switch on) ──
  interface CheckoutPrograms {
    discount: { enabled: boolean; percent: number; stack_mode: "best" | "stack"; tier_name: string | null };
    wallet: { enabled: boolean; balance: number; max_percent: number };
    affiliate: { enabled: boolean; attribution_days: number };
  }
  const [programs, setPrograms] = useState<CheckoutPrograms | null>(null);
  const [useWallet, setUseWallet] = useState(false);
  useEffect(() => {
    if (!user) return;
    apiFetch("/api/memberships/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => { if (json?.data?.discount && json.data.wallet) setPrograms(json.data as CheckoutPrograms); })
      .catch(() => {});
  }, [user]);

  const [deliveryZones, setDeliveryZones] = useState<CheckoutZone[]>([]);
  const [selectedZone, setSelectedZone] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryTimeSlot, setDeliveryTimeSlot] = useState("");
  const selectedDeliveryZone = deliveryZones.find(zone => zone.id === selectedZone);
  const shippingThreshold = Number(selectedDeliveryZone?.free_shipping_min || 0);
  // Same rules as the server (src/services/promotions/money-rules.ts); the server result is final.
  const merchandiseCents = Math.round(total * 100);
  const discounts = programs?.discount.enabled
    ? combineDiscounts({
        merchandiseCents,
        couponCents: Math.round(couponDiscount * 100),
        memberBps: Math.round(programs.discount.percent * 100),
        stackMode: programs.discount.stack_mode,
      })
    : { couponCents: Math.min(Math.round(couponDiscount * 100), merchandiseCents), memberCents: 0 };
  const afterDiscounts = (merchandiseCents - discounts.couponCents - discounts.memberCents) / 100;
  const shippingCost = selectedDeliveryZone
    ? (shippingThreshold > 0 && Math.max(0, afterDiscounts) >= shippingThreshold ? 0 : Number(selectedDeliveryZone.base_rate))
    : 0;
  // 日期下限在挂载后计算，避免服务端与客户端跨日不一致
  const [minDeliveryDate, setMinDeliveryDate] = useState("");
  useEffect(() => {
    setMinDeliveryDate(new Date(Date.now() + 86400000).toISOString().split("T")[0]);
  }, []);

  useEffect(() => {
    fetch("/api/delivery-zones")
      .then(r => r.json())
      .then(j => {
        const zones = j.data || [];
        setDeliveryZones(zones);
        if (zones.length > 0) setSelectedZone((prev) => prev || zones[0].id);
      })
      .catch(() => {})
      .finally(() => setZonesReady(true));
  }, []);

  const payableCents = Math.max(0, Math.round(afterDiscounts * 100)) + Math.round(shippingCost * 100);
  const walletCents = useWallet && programs?.wallet.enabled
    ? walletShareCents({ payableCents, balanceCents: Math.round(programs.wallet.balance * 100), maxPercent: programs.wallet.max_percent })
    : 0;
  const payable = (payableCents - walletCents) / 100;

  async function applyCoupon() {
    const code = couponCode.trim();
    if (!code) {
      setCouponMessage({ kind: "err", text: t("checkout.coupon_required") });
      return;
    }
    setCouponLoading(true);
    try {
      const res = await apiFetch(`/api/coupons/validate?code=${encodeURIComponent(code)}&amount=${total.toFixed(2)}`);
      const json = await res.json();
      if (!res.ok || !json.valid) {
        setCouponDiscount(0);
        setCouponMessage({ kind: "err", text: json.message || json.error || t("checkout.coupon_invalid") });
      } else {
        setCouponDiscount(Number(json.discount) || 0);
        setCouponMessage({ kind: "ok", text: json.message || t("common.success") });
      }
    } catch {
      setCouponDiscount(0);
      setCouponMessage({ kind: "err", text: t("checkout.coupon_failed") });
    } finally {
      setCouponLoading(false);
    }
  }

  function clearCoupon() {
    setCouponCode("");
    setCouponDiscount(0);
    setCouponMessage(null);
  }

  useEffect(() => {
    if (user) {
      setEmail(user.email);
      setName(user.name || "");
    }
  }, [user]);

  // Set once an order is placed: the cart empties on purpose while the page is
  // already navigating to the result page, so keep showing the loading state
  // instead of flashing the empty-cart view.
  const [orderPlaced, setOrderPlaced] = useState(false);

  async function handleCheckout() {
    // 鉴权尚未解析完成时不要误判为未登录，避免把已登录用户踢到登录页
    if (authLoading) {
      toast.info(t("checkout.verifying_session"));
      return;
    }
    if (!user) {
      toast.error(t("checkout.login_first"));
      router.push("/auth/login");
      return;
    }
    if (!email) {
      toast.error(t("checkout.email_first"));
      return;
    }
    if (isOfflineProvider && !phone.trim()) {
      toast.error(t("checkout.phone_required"));
      return;
    }

    setLoading(true);
    try {
      let source = "web";
      try {
        const stored = localStorage.getItem("attribution");
        if (stored) {
          const a = JSON.parse(stored);
          if (a.fbclid) source = "facebook";
          else if (a.igshid) source = "instagram";
          else if (a.utm_source === "instagram") source = "instagram";
          else if (a.utm_source === "facebook") source = "facebook";
          else if (a.utm_source === "whatsapp") source = "whatsapp";
          else if (a.utm_source) source = a.utm_source;
        }
      } catch { /* ignore */ }

      const orderBody = {
        paymentMethod: provider,
        buyerEmail: email,
        buyerName: name,
        buyerPhone: phone.trim() || undefined,
        couponCode: couponDiscount > 0 ? couponCode.trim() : undefined,
        source,
        delivery_zone_id: selectedZone || undefined,
        shipping_cost: shippingCost > 0 ? shippingCost.toFixed(2) : undefined,
        delivery_date: deliveryDate || undefined,
        delivery_time_slot: deliveryTimeSlot || undefined,
        useWallet: walletCents > 0 ? true : undefined,
        affiliateCode: programs?.affiliate.enabled ? readAffiliateRef(programs.affiliate.attribution_days) ?? undefined : undefined,
        items: items.map((item) => ({
          product_id: item.id,
          variant_id: item.variant_id || null,
          quantity: item.quantity,
          delivery_method: item.delivery_method || null,
        })),
      };
      const signature = JSON.stringify(orderBody);
      // Survives a reload: the same order body reuses the key, so the server replays the first order.
      const orderRes = await apiFetch("/api/orders", {
        method: "POST", headers: { "Idempotency-Key": checkoutIdempotencyKey(signature) }, body: signature,
      });
      const orderJson = await orderRes.json();
      if (orderRes.status === 409 && orderJson.code === "WALLET_INSUFFICIENT") {
        throw new Error(t("checkout.wallet_changed"));
      }
      if (!orderRes.ok || orderJson.error) {
        throw new Error(orderJson.error || "Order creation failed");
      }

      const orderId = orderJson.id || orderJson.data?.id;
      if (!orderId) throw new Error("Order creation failed");

      // Fully paid from the wallet: nothing left to collect.
      if ((orderJson.payment_status || orderJson.data?.payment_status) === "paid") {
        setOrderPlaced(true);
        clearCart();
        router.push(`/checkout/success?order_id=${orderId}`);
        return;
      }

      // 线下支付：不调 /api/payment/create，直接跳成功页
      if (provider !== "paypal" && provider !== "stripe") {
        setOrderPlaced(true);
        clearCart();
        router.push(`/checkout/success?manual=1&order_id=${orderId}`);
        return;
      }

      const res = await apiFetch("/api/payment/create", {
        method: "POST",
        body: JSON.stringify({ provider, orderId }),
      });
      const json = await res.json();

      if (json.data?.approvalUrl) {
        setOrderPlaced(true);
        clearCart();
        window.location.href = json.data.approvalUrl;
      } else if (json.data?.message?.includes("Mock")) {
        // Mock mode fallback
        setOrderPlaced(true);
        clearCart();
        router.push(`/checkout/success?mock=1&order_id=${orderId}`);
      } else {
        toast.error(json.error || json.data?.message || "Payment creation failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error, please retry");
    } finally {
      setLoading(false);
    }
  }

  const steps = [
    { label: t("crumb.cart"), done: true },
    { label: t("checkout.step_details"), done: !!email && (!isOfflineProvider || !!phone.trim()) },
    { label: t("checkout.step_payment"), done: false },
  ];

  if (!mounted || !methodsReady || !zonesReady || (items.length === 0 && orderPlaced)) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 h-5 w-40 animate-pulse rounded-md bg-muted" />
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            {[1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-3xl bg-muted" />)}
          </div>
          <div className="h-96 animate-pulse rounded-3xl bg-muted lg:col-span-5" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Lock className="h-8 w-8" weight="duotone" />
        </span>
        <h1 className="mt-6 font-display text-2xl font-medium">{t("cart.empty")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("cart.empty_desc")}</p>
        <Button asChild size="lg" className="mt-7">
          <Link href="/products">{t("home.hero.cta.primary")}</Link>
        </Button>
      </div>
    );
  }

  const allMethods = [
    { code: "paypal", name: "PayPal", desc: t("checkout.paypal_desc") },
    { code: "stripe", name: t("checkout.card_payment"), desc: t("checkout.stripe_desc") },
    ...offlineMethods.map((m) => ({
      code: m.code,
      name: locale === "zh" ? m.name : m.name_en || m.name,
      desc: translate(locale, "checkout.offline_payment_help"),
    })),
  ];

  const slots = Array.isArray(selectedDeliveryZone?.time_slots) ? selectedDeliveryZone!.time_slots as { label?: string; label_en?: string }[] : [];


  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <BreadcrumbPublic items={[{ label: t("crumb.cart"), href: "/cart" }, { label: t("crumb.checkout") }]} />

      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-display text-3xl font-medium sm:text-4xl">
            {t("cart.checkout")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {count} {t("cart.items_count")} · {t("checkout.secure_note")}
          </p>
        </div>
        {/* Steps */}
        <ol className="flex items-center gap-2">
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2">
              <span className={cn("inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors",
                s.done ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground"
              )}>
                <span className={cn("flex h-4 w-4 items-center justify-center rounded-md text-[11px] font-medium",
                  s.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {s.done ? <Check className="h-2.5 w-2.5" weight="bold" /> : i + 1}
                </span>
                {s.label}
              </span>
              {i < steps.length - 1 && <span className="h-px w-4 bg-border" aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        {/* ── Form column ── */}
        <div className="space-y-5 lg:col-span-7">
          {/* Contact */}
          <section className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-7">
            <div className="mb-5 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <UserCircle className="h-4 w-4" weight="duotone" />
              </span>
              <h2 className="font-display text-base font-medium">{t("checkout.contact_info")}</h2>
              {!user && (
                <Link href="/auth/login" className="ml-auto text-[12.5px] font-medium text-primary hover:underline">
                  {t("nav.login")}
                </Link>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">{t("checkout.your_name")}</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("checkout.your_name_placeholder")} autoComplete="name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t("checkout.email_required")}</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="phone">
                  {t("checkout.phone_label")}
                  {isOfflineProvider
                    ? <span className="ml-0.5 text-destructive">*</span>
                    : <span className="ml-1 text-xs text-muted-foreground">{t("checkout.phone_optional")}</span>}
                </Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("checkout.phone_placeholder")} autoComplete="tel" required={isOfflineProvider} />
                {isOfflineProvider && (
                  <p className="text-[12px] text-muted-foreground">{t("checkout.phone_offline_note")}</p>
                )}
              </div>
            </div>
          </section>

          {/* Delivery */}
          {deliveryZones.length > 0 && (
            <section className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-7">
              <div className="mb-5 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Truck className="h-4 w-4" weight="duotone" />
                </span>
                <h2 className="font-display text-base font-medium">{t("checkout.delivery_title")}</h2>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {deliveryZones.map((z) => {
                  const active = selectedZone === z.id;
                  const threshold = Number(z.free_shipping_min || 0);
                  const free = threshold > 0 && Math.max(0, total - couponDiscount) >= threshold;
                  return (
                    <button
                      key={z.id}
                      type="button"
                      onClick={() => { setSelectedZone(z.id); setDeliveryTimeSlot(""); }}
                      className={cn("rounded-2xl border p-4 text-left transition-colors duration-200",
                        active ? "border-primary bg-primary-soft shadow-card" : "border-border hover:border-border-strong"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("font-display text-[14px] font-medium", active && "text-primary")}>
                          {locale === "zh" ? z.name : z.name_en || z.name}
                        </span>
                        {active && <Check className="h-4 w-4 text-primary" weight="bold" />}
                      </div>
                      <p className="mt-2 font-mono text-[11.5px] text-muted-foreground">
                        {free ? t("cart.shipping_free") : `${t("home.fulfilment.from")} ${formatPrice(Number(z.base_rate))}`}
                        {threshold > 0 && ` · ${t("home.fulfilment.free_over")} ${formatPrice(threshold)}`}
                      </p>
                    </button>
                  );
                })}
              </div>

              {selectedZone && (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ddate">{t("checkout.delivery_date_label")}</Label>
                    <Input id="ddate" type="date" min={minDeliveryDate || undefined} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
                  </div>
                  {slots.length > 0 && (
                    <div className="space-y-2">
                      <Label>{t("checkout.delivery_slot_label")}</Label>
                      <div className="flex flex-wrap gap-2">
                        {slots.map((slot, i) => {
                          const value = slot.label || slot.label_en || `Slot ${i + 1}`;
                          const active = deliveryTimeSlot === value;
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setDeliveryTimeSlot(active ? "" : value)}
                              className={cn("rounded-md border px-3 py-1.5 text-[12.5px] font-medium transition-colors duration-200",
                                active ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:text-foreground"
                              )}
                            >
                              {locale === "zh" ? slot.label || slot.label_en : slot.label_en || slot.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Payment */}
          <section className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-7">
            <div className="mb-5 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <CreditCard className="h-4 w-4" weight="duotone" />
              </span>
              <h2 className="font-display text-base font-medium">{t("checkout.payment_method")}</h2>
            </div>
            <div className="space-y-2">
              {allMethods.map((m) => {
                const active = provider === m.code;
                return (
                  <button
                    key={m.code}
                    type="button"
                    onClick={() => setProvider(m.code)}
                    className={cn("flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors duration-200",
                      active ? "border-primary bg-primary-soft shadow-card" : "border-border hover:border-border-strong"
                    )}
                  >
                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      {PAYMENT_ICON[m.code] || <CreditCard className="h-5 w-5" weight="duotone" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block font-display text-[14px] font-medium", active && "text-primary")}>{m.name}</span>
                      <span className="mt-1 block text-[12px] text-muted-foreground">{m.desc}</span>
                    </span>
                    <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                      active ? "border-primary bg-primary" : "border-border"
                    )}>
                      {active && <Check className="h-3 w-3 text-primary-foreground" weight="bold" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* ── Summary column ── */}
        <div className="lg:col-span-5">
          <div className="sticky top-24 overflow-hidden rounded-3xl border border-border bg-card shadow-lift">
            <div className="border-b border-border bg-muted/40 px-6 py-4">
              <h2 className="font-display text-base font-medium">{t("checkout.order_summary")}</h2>
            </div>

            <div className="max-h-[280px] space-y-3 overflow-y-auto px-6 py-5">
              {items.map((item) => (
                <div key={item.variant_id ? `${item.id}::${item.variant_id}` : item.id} className="flex items-center gap-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                    {item.image_key
                      ? <Image src={item.image_key} alt={item.title} fill sizes="56px" className="object-cover" />
                      : <ProductThumb type={item.type} sizes="56px" />}
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-md bg-primary px-1 text-[11px] font-medium text-primary-foreground">
                      {item.quantity}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-[13px] font-medium">{item.title}</p>
                    {item.variant_name && <p className="mt-1 truncate text-[11.5px] text-muted-foreground">{item.variant_name}</p>}
                  </div>
                  <span className="shrink-0 font-mono text-[13px] font-medium tabular-nums">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-border px-6 py-5">
              <Label htmlFor="coupon" className="mb-2 flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
                <Tag className="h-3.5 w-3.5" />
                {t("checkout.coupon_label")}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="coupon"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder={t("checkout.coupon_placeholder")}
                  disabled={couponDiscount > 0 || couponLoading}
                  className="font-mono"
                />
                {couponDiscount > 0 ? (
                  <Button type="button" variant="outline" onClick={clearCoupon}>{t("checkout.coupon_remove")}</Button>
                ) : (
                  <Button type="button" variant="outline" onClick={applyCoupon} disabled={couponLoading}>
                    {couponLoading ? <Spinner className="h-4 w-4 animate-spin" /> : t("checkout.coupon_apply")}
                  </Button>
                )}
              </div>
              {couponMessage && (
                <p className={cn("mt-2 text-[12px]", couponMessage.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                  {couponMessage.text}
                </p>
              )}
              {demoMode && couponDiscount === 0 && !couponMessage && (
                <p className="mt-2 text-[11.5px] text-muted-foreground">{t("checkout.coupon_hint")}</p>
              )}
            </div>

            <div className="border-t border-border px-6 py-5">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("checkout.subtotal")}</span>
                  <span className="font-mono tabular-nums">{formatPrice(total)}</span>
                </div>
                {discounts.couponCents > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>{t("checkout.discount")}</span>
                    <span className="font-mono tabular-nums">-{formatPrice(discounts.couponCents / 100)}</span>
                  </div>
                )}
                {couponDiscount > 0 && discounts.couponCents === 0 && (
                  <p className="text-[12px] text-amber-600 dark:text-amber-400">{t("checkout.coupon_replaced_by_member")}</p>
                )}
                {discounts.memberCents > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>{translate(locale, "checkout.member_discount", { tier: programs?.discount.tier_name || "", percent: String(programs?.discount.percent ?? 0) })}</span>
                    <span className="font-mono tabular-nums">-{formatPrice(discounts.memberCents / 100)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("cart.shipping")}</span>
                  <span className={cn("font-mono tabular-nums", shippingCost === 0 && selectedZone && "text-emerald-600 dark:text-emerald-400")}>
                    {!selectedZone ? t("cart.shipping_at_checkout") : shippingCost === 0 ? t("cart.shipping_free") : formatPrice(shippingCost)}
                  </span>
                </div>
              </div>

              {programs?.wallet.enabled && programs.wallet.balance > 0 && (
                <label className="mt-3 flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5 text-sm">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 accent-primary" checked={useWallet} onChange={(e) => setUseWallet(e.target.checked)} />
                    {translate(locale, "checkout.use_wallet", { balance: formatPrice(programs.wallet.balance) })}
                  </span>
                  {walletCents > 0 && <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">-{formatPrice(walletCents / 100)}</span>}
                </label>
              )}

              <div className="my-4 h-px bg-border" />

              <div className="flex items-end justify-between">
                <span className="text-sm font-medium">{t("cart.total")}</span>
                <span className="font-display text-3xl font-medium tabular-nums">{formatPrice(payable)}</span>
              </div>

              <Button size="lg" className="mt-5 w-full" disabled={loading || authLoading} onClick={handleCheckout}>
                {authLoading ? (
                  <>
                    <Spinner className="mr-1.5 h-4 w-4 animate-spin" />
                    {t("checkout.verifying_session")}
                  </>
                ) : loading ? (
                  <>
                    <Spinner className="mr-1.5 h-4 w-4 animate-spin" />
                    {t("checkout.processing")}
                  </>
                ) : (
                  <>
                    <ShieldCheck className="mr-1.5 h-4 w-4" weight="fill" />
                    {t("checkout.pay")} {formatPrice(payable)}
                  </>
                )}
              </Button>

              <div className="mt-4 space-y-2 text-[12px] text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  {t("checkout.ssl_note")}
                </p>
                <p className="flex items-center gap-2">
                  <ArrowCounterClockwise className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  {t("product.refund_7day")}
                </p>
              </div>
            </div>
          </div>

          <Button asChild variant="ghost" className="mt-4 w-full text-muted-foreground">
            <Link href="/cart">
              <ArrowLeft className="mr-1 h-4 w-4" />
              {t("checkout.back_to_cart")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}