"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/contexts/cart-context";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { useCurrency } from "@/contexts/currency-context";
import { formatSalesMoney, translate } from "@/i18n";
import { apiFetch } from "@/lib/client-api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  ShoppingCart,
  ArrowLeft,
  CreditCard,
  ShieldCheck,
  Spinner,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { BreadcrumbPublic } from "@/components/breadcrumb-public";

export default function CheckoutPage() {
  const { items, total, count, clearCart } = useCart();
  const { user, loading: authLoading } = useAuth();
  const { locale, t } = useI18n();
  const { currency, convert, format: formatPrice } = useCurrency();
  const router = useRouter();
  const [provider, setProvider] = useState<"paypal" | "stripe" | string>("paypal");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  // 线下支付（非 paypal/stripe）必须留手机号,后端 order-service 强校验
  const isOfflineProvider = provider !== "paypal" && provider !== "stripe";

  // ── Offline payment methods ──
  const [offlineMethods, setOfflineMethods] = useState<Array<{ code: string; name: string; name_en: string | null }>>([]);

  useEffect(() => {
    fetch("/api/payment-methods")
      .then(r => r.json())
      .then(j => setOfflineMethods(j.data || []))
      .catch(() => {});
  }, []);

  // ── Coupon ──
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  // ── Maputo Delivery ──
  interface CheckoutZone { id: string; name: string; name_en: string | null; base_rate: string; free_shipping_min: string | null; time_slots: unknown; }
  const [deliveryZones, setDeliveryZones] = useState<CheckoutZone[]>([]);
  const [selectedZone, setSelectedZone] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryTimeSlot, setDeliveryTimeSlot] = useState("");
  const [shippingCost, setShippingCost] = useState(0);

  useEffect(() => {
    fetch("/api/admin/delivery-zones?active=true")
      .then(r => r.json())
      .then(j => setDeliveryZones(j.data || []))
      .catch(() => {});
  }, []);

  const payable = Math.max(0, total - couponDiscount) + shippingCost;

  async function applyCoupon() {
    const code = couponCode.trim();
    if (!code) {
      setCouponMessage({ kind: "err", text: t("checkout.coupon_required") });
      return;
    }
    setCouponLoading(true);
    try {
      const res = await apiFetch(
        `/api/coupons/validate?code=${encodeURIComponent(code)}&amount=${total.toFixed(2)}`
      );
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

  // Redirect to products if cart is empty
  useEffect(() => {
    if (items.length === 0 && !loading) {
      router.replace("/products");
    }
  }, [items.length, loading, router]);

  if (items.length === 0) {
    return null;
  }

  async function handleCheckout() {
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
      // 读取归因来源
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

      const orderRes = await apiFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify({
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
          items: items.map((item) => ({
            product_id: item.id,
            variant_id: item.variant_id || null,
            quantity: item.quantity,
            delivery_method: (item as any).delivery_method || null,
          })),
        }),
      });
      const orderJson = await orderRes.json();
      if (!orderRes.ok || orderJson.error) {
        throw new Error(orderJson.error || "Order creation failed");
      }

      const orderId = orderJson.id || orderJson.data?.id;
      if (!orderId) {
        throw new Error("Order creation failed");
      }

      // 线下支付：不调 /api/payment/create，直接跳成功页
      if (provider !== "paypal" && provider !== "stripe") {
        clearCart();
        router.push(`/checkout/success?manual=1&order_id=${orderId}`);
        return;
      }

      const res = await apiFetch("/api/payment/create", {
        method: "POST",
        body: JSON.stringify({
          provider,
          orderId,
        }),
      });

      const json = await res.json();

      if (json.data?.approvalUrl) {
        clearCart();
        window.location.href = json.data.approvalUrl;
      } else if (json.data?.message?.includes("Mock")) {
        // Mock mode fallback
        clearCart();
        router.push(`/checkout/success?mock=1`);
      } else {
        toast.error(json.error || json.data?.message || "Payment creation failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error, please retry");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <BreadcrumbPublic items={[{ label: t("crumb.cart"), href: "/cart" }, { label: t("crumb.checkout") }]} />
      <Button variant="ghost" className="mb-6" onClick={() => router.push("/cart")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t("nav.cart")}
      </Button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t("cart.checkout")}</h1>

      <div className="grid gap-6">
        {/* Contact info */}
        <Card>
          <CardContent className="p-6">
            <h2 className="font-semibold text-gray-900 mb-4">{t("checkout.contact_info")}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="name">{t("checkout.your_name")}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("checkout.your_name_placeholder")}
                />
              </div>
              <div>
                <Label htmlFor="email">{t("checkout.email_required")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone">
                  {t("checkout.phone_label")}{isOfflineProvider ? <span className="text-red-500 ml-0.5">*</span> : <span className="text-gray-400 ml-1 text-xs">{t("checkout.phone_optional")}</span>}
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+258 84 000 0000"
                  required={isOfflineProvider}
                />
                {isOfflineProvider && (
                  <p className="mt-1 text-xs text-gray-500">{t("checkout.phone_offline_note")}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Order summary */}
        <Card>
          <CardContent className="p-6">
            <h2 className="font-semibold text-gray-900 mb-4">{t("checkout.order_summary")}</h2>
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.variant_id ? `${item.id}::${item.variant_id}` : item.id} className="flex items-center justify-between text-sm">
                  <span className="flex-1 truncate">
                    {item.title}
                    {item.variant_name && <span className="text-gray-400 ml-1">({item.variant_name})</span>}
                    <span className="ml-1 text-gray-400">x{item.quantity}</span>
                  </span>
                  <span className="font-medium ml-4">{formatPrice(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>

            {/* Coupon */}
            <Separator className="my-4" />
            <div className="space-y-2">
              <Label htmlFor="coupon" className="text-sm text-gray-700">{t("checkout.coupon_label")}</Label>
              <div className="flex gap-2">
                <Input
                  id="coupon"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder={t("checkout.coupon_placeholder")}
                  disabled={couponDiscount > 0 || couponLoading}
                />
                {couponDiscount > 0 ? (
                  <Button type="button" variant="outline" onClick={clearCoupon}>
                    {t("checkout.coupon_remove")}
                  </Button>
                ) : (
                  <Button type="button" variant="outline" onClick={applyCoupon} disabled={couponLoading}>
                    {couponLoading ? "..." : t("checkout.coupon_apply")}
                  </Button>
                )}
              </div>
              {couponMessage && (
                <p
                  className={
                    "text-xs " +
                    (couponMessage.kind === "ok" ? "text-green-600" : "text-red-600")
                  }
                >
                  {couponMessage.text}
                </p>
              )}
            </div>

            <Separator className="my-4" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>{t("checkout.subtotal")}</span>
                <span>{formatPrice(total)}</span>
              </div>
              {couponDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>{t("checkout.discount")}</span>
                  <span>-{formatPrice(couponDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold text-gray-900 pt-1">
                <span>{t("cart.total")}</span>
                <span>{formatPrice(payable)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Maputo Delivery */}
        {deliveryZones.length > 0 && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 mb-2">{translate(locale, "checkout.maputo_delivery")}</h2>
              <div>
                <Label>{translate(locale, "checkout.delivery_zone")}</Label>
                <Select value={selectedZone} onValueChange={(v) => {
                  setSelectedZone(v);
                  const zone = deliveryZones.find(z => z.id === v);
                  if (zone) {
                    const subtotal = total - couponDiscount;
                    const fsm = zone.free_shipping_min ? Number(zone.free_shipping_min) : 0;
                    setShippingCost(fsm > 0 && subtotal >= fsm ? 0 : Number(zone.base_rate));
                  }
                  setDeliveryTimeSlot("");
                }}>
                  <SelectTrigger><SelectValue placeholder={translate(locale, "checkout.select_zone")} /></SelectTrigger>
                  <SelectContent>
                    {deliveryZones.map((z) => (
                      <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedZone && (() => {
                const zone = deliveryZones.find(z => z.id === selectedZone);
                const slots = zone?.time_slots;
                const slotList = Array.isArray(slots) ? slots : [];
                const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
                return (
                  <>
                    <div>
                      <Label>{translate(locale, "checkout.delivery_date")}</Label>
                      <Input type="date" min={tomorrow} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
                    </div>
                    {slotList.length > 0 && (
                      <div>
                        <Label>{translate(locale, "checkout.delivery_slot")}</Label>
                        <Select value={deliveryTimeSlot} onValueChange={setDeliveryTimeSlot}>
                          <SelectTrigger><SelectValue placeholder={translate(locale, "checkout.select_slot")} /></SelectTrigger>
                          <SelectContent>
                            {slotList.map((slot: { label?: string; label_en?: string }, i: number) => (
                              <SelectItem key={i} value={slot.label || slot.label_en || `Slot ${i + 1}`}>
                                {slot.label_en || slot.label || `Slot ${i + 1}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="text-sm text-muted-foreground">
                      {translate(locale, "checkout.shipping_cost", {
                        amount: formatSalesMoney(locale, convert(shippingCost), currency),
                      })}
                      {zone?.free_shipping_min && Number(zone.free_shipping_min) > 0 && (
                        <span className="ml-2">
                          {translate(locale, "checkout.free_shipping_threshold", {
                            amount: formatSalesMoney(
                              locale,
                              convert(Number(zone.free_shipping_min)),
                              currency,
                            ),
                          })}
                        </span>
                      )}
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Payment method */}
        <Card>
          <CardContent className="p-6">
            <h2 className="font-semibold text-gray-900 mb-4">{t("checkout.payment_method")}</h2>
            <RadioGroup value={provider} onValueChange={(v) => setProvider(v as "paypal" | "stripe")}>
              <div className="flex items-center space-x-2 rounded-lg border p-4 cursor-pointer hover:bg-gray-50">
                <RadioGroupItem value="paypal" id="paypal" />
                <Label htmlFor="paypal" className="flex items-center gap-2 cursor-pointer">
                  <CreditCard className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="font-semibold">PayPal</p>
                    <p className="text-xs text-gray-500">{t("checkout.paypal_desc")}</p>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-2 rounded-lg border p-4 mt-2 cursor-pointer hover:bg-gray-50">
                <RadioGroupItem value="stripe" id="stripe" />
                <Label htmlFor="stripe" className="flex items-center gap-2 cursor-pointer">
                  <CreditCard className="h-5 w-5 text-purple-600" />
                  <div>
                    <p className="font-semibold">Stripe</p>
                    <p className="text-xs text-gray-500">{t("checkout.stripe_desc")}</p>
                  </div>
                </Label>
              </div>
              {offlineMethods.map((m) => (
                <div key={m.code} className="flex items-center space-x-2 rounded-lg border p-4 mt-2 cursor-pointer hover:bg-gray-50">
                  <RadioGroupItem value={m.code} id={m.code} />
                  <Label htmlFor={m.code} className="flex items-center gap-2 cursor-pointer">
                    <CreditCard className="h-5 w-5 text-gray-600" />
                    <div>
                      <p className="font-semibold">{m.name}{m.name_en ? <span className="text-xs text-gray-400 ml-1">({m.name_en})</span> : null}</p>
                      <p className="text-xs text-gray-500">{translate(locale, "checkout.offline_payment_help")}</p>
                    </div>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Pay button */}
        <Button
          className="w-full py-6 text-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          disabled={loading || authLoading}
          onClick={handleCheckout}
        >
          {loading ? (
            <>
              <Spinner className="mr-2 h-5 w-5 animate-spin" />
              {t("checkout.processing")}
            </>
          ) : (
            <>
              <ShieldCheck className="mr-2 h-5 w-5" />
              {t("checkout.pay")} {formatPrice(payable)}
            </>
          )}
        </Button>
        <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1">
          <ShieldCheck className="h-3 w-3" />
          {t("checkout.ssl_note")}
        </p>
      </div>
    </div>
  );
}
