"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { useI18n } from "@/contexts/i18n-context";
import { useCart } from "@/contexts/cart-context";
import { useCurrency } from "@/contexts/currency-context";
import { productJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { Star } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ProductThumb } from "@/components/product-thumb";
import { BreadcrumbPublic } from "@/components/breadcrumb-public";
import { RecentTracker } from "@/components/motion";
import { StickyBuyBar } from "@/components/sticky-buy-bar";
import { WishlistButton } from "@/components/wishlist-button";
import { useUI } from "@/contexts/ui-context";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/utils";
import {
  ShoppingCart,
  Clock,
  Download,
  Envelope,
  WifiHigh,
  CheckCircle,
  Check,
  ShieldCheck,
  Truck,
  WhatsappLogo,
  Package,
  SealCheck,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import Link from "next/link";
import { parseDeliveryMethods, getDeliveryMethodByCode } from "@/config/delivery-methods";
import type { CartItem } from "@/contexts/cart-context";
import { apiFetch } from "@/lib/client-api";

interface CategoryInfo {
  id: string;
  name: string;
  name_en: string | null;
  name_ja: string | null;
  name_es: string | null;
}

interface ProductImage {
  id: string;
  src: string;
  alt: string | null;
  variant_id: string | null;
  position: number | null;
}

interface ProductVariant {
  id: string;
  title: string | null;
  sku: string | null;
  price: string | number | null;
  stock?: number | null;
}

interface ProductReview {
  id: string;
  rating: number;
  title: string;
  content: string;
  created_at: string;
  author?: string | null;
  is_verified?: boolean | null;
}

interface ProductRecommendation {
  id: string;
  title: string;
  title_en?: string | null;
  price: string | number;
  image_key?: string | null;
  type?: string;
  rating?: number;
}

interface Product {
  id: string;
  title: string;
  title_en: string | null;
  title_pt: string | null;
  title_ja: string | null;
  title_es: string | null;
  description: string | null;
  description_en: string | null;
  description_pt: string | null;
  description_ja: string | null;
  description_es: string | null;
  price: string;
  compare_at_price?: string | null;
  category_id: string;
  type: string;
  duration: string | null;
  delivery_method: string | null;
  status: string;
  image_key: string | null;
  meta_title: string | null;
  meta_description: string | null;
  images?: ProductImage[];
  categories: CategoryInfo | null;
  rating?: number;
  review_count?: number;
  sold_count?: number;
  stock?: number;
  vendor?: string;
  highlights?: string[];
  highlights_en?: string[];
}

const deliveryIcons: Record<string, React.ReactNode> = {
  online: <WifiHigh className="h-4 w-4" />,
  email: <Envelope className="h-4 w-4" />,
  download: <Download className="h-4 w-4" />,
  shipping: <Truck className="h-4 w-4" />,
};

export default function ProductDetailPage() {
  const params = useParams();
  const { t, locale } = useI18n();
  const { addItem } = useCart();
  const { openCart } = useUI();
  const { format: formatPrice } = useCurrency();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [recommendations, setRecommendations] = useState<ProductRecommendation[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [selectedImage, setSelectedImage] = useState("");
  const [selectedDelivery, setSelectedDelivery] = useState<string>("");
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: "", content: "" });
  const [submitting, setSubmitting] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [whatsappMessage, setWhatsappMessage] = useState("");

  // 加载评论和推荐
  useEffect(() => {
    if (!params.id) return
    fetch(`/api/reviews?product_id=${params.id}`).then(r => r.json()).then(j => setReviews(j.data || [])).catch(() => {})
    fetch(`/api/recommendations?product_id=${params.id}`).then(r => r.json()).then(j => setRecommendations(j.data || [])).catch(() => {})
  }, [params.id])

  // ── 加载 WhatsApp 配置 ──
  useEffect(() => {
    fetch("/api/public/settings")
      .then(r => r.json())
      .then(j => {
        const site = j.data?.site || {};
        setWhatsappNumber(site.whatsappNumber || "");
        setWhatsappMessage(site.whatsappMessage || "");
      })
      .catch(() => {});
  }, []);

  // JSON-LD + 页面标题更新（使用 ref 安全管理 DOM 节点）
  const prodScriptRef = useRef<HTMLScriptElement | null>(null)
  const breadScriptRef = useRef<HTMLScriptElement | null>(null)

  useEffect(() => {
    if (!product) return

    // 动态更新页面标题（使用本地化标题）
    document.title = `${getLocalizedField("title")} | GlobalTrade Hub`

    // 安全移除上一次创建的脚本（仅移除我们自己的 ref）
    if (prodScriptRef.current && prodScriptRef.current.parentNode) {
      prodScriptRef.current.remove()
    }
    if (breadScriptRef.current && breadScriptRef.current.parentNode) {
      breadScriptRef.current.remove()
    }

    const localizedTitle = getLocalizedField("title");
    const localizedDesc = getLocalizedField("description") || localizedTitle;

    // Product Schema
    const prodScript = document.createElement("script")
    prodScript.type = "application/ld+json"
    prodScript.setAttribute("data-seo", "product")
    prodScript.textContent = productJsonLd({
      id: product.id,
      title: localizedTitle,
      description: localizedDesc,
      price: product.price,
      type: product.type,
      currency: "USD",
      image: product.image_key || undefined,
    })
    document.head.appendChild(prodScript)
    prodScriptRef.current = prodScript

    // Breadcrumb Schema
    const breadScript = document.createElement("script")
    breadScript.type = "application/ld+json"
    breadScript.setAttribute("data-seo", "breadcrumb")
    breadScript.textContent = breadcrumbJsonLd([
      { name: "Home", url: window.location.origin },
      { name: "Products", url: `${window.location.origin}/products` },
      { name: localizedTitle, url: window.location.href },
    ])
    document.head.appendChild(breadScript)
    breadScriptRef.current = breadScript

    return () => {
      // 安全 cleanup：检查 parentNode 避免 removeChild 错误
      if (prodScriptRef.current && prodScriptRef.current.parentNode) {
        prodScriptRef.current.remove()
      }
      if (breadScriptRef.current && breadScriptRef.current.parentNode) {
        breadScriptRef.current.remove()
      }
    }
  }, [product])
  useEffect(() => {
    async function fetchProduct() {
      if (!params.id) return;
      try {
        const res = await fetch(`/api/products/${params.id as string}`);
        const result = await res.json();
        if (result.error) throw new Error(result.error);
        const nextProduct = result.data as Product | null;
        setProduct(nextProduct);
        const firstImage = nextProduct?.image_key || nextProduct?.images?.[0]?.src || "";
        setSelectedImage(firstImage);
        // Fetch variants
        try {
          const vRes = await fetch('/api/products/' + params.id + '/variants');
          const vResult = await vRes.json();
          if (vResult.data && vResult.data.length > 0) {
            setVariants(vResult.data);
          }
        } catch {}
      } catch (err) {
        console.error("Failed to fetch product:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchProduct();
  }, [params.id]);

  function getLocalizedField(field: string): string {
    if (!product) return "";
    const record = product as unknown as Record<string, unknown>;
    if (locale === "zh") {
      return (record[field] as string) || "";
    }
    // Try locale-specific (e.g. title_pt), then English, then default
    const localizedKey = `${field}_${locale}`;
    return (record[localizedKey] as string) || (record[`${field}_en`] as string) || (record[field] as string) || "";
  }

  function getCategoryName(): string {
    if (!product?.categories) return "";
    if (locale === "zh") return product.categories.name;
    const key = `name_${locale}` as keyof CategoryInfo;
    const record = product.categories as unknown as Record<string, unknown>;
    return (record[key] as string) || (record.name_en as string) || product.categories.name;
  }

  function submitReview() {
    if (!reviewForm.content) return toast.error(t("product.review_content_required"))
    setSubmitting(true)
    apiFetch("/api/reviews", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: params.id, ...reviewForm }),
    }).then(async (res) => {
      if (!res.ok) throw new Error()
      toast.success(t("product.review_submitted"))
      setReviewForm({ rating: 5, title: "", content: "" })
      const j = await fetch(`/api/reviews?product_id=${params.id}`).then(r => r.json())
      setReviews(j.data || [])
    }).catch(() => toast.error(t("product.submit_failed")))
    .finally(() => setSubmitting(false))
  }

  function handleAddToCart() {
    if (!product) return;
    const activePrice = selectedVariant && selectedVariant.price ? Number(selectedVariant.price) : Number(product.price);
    const activeTitle = selectedVariant && selectedVariant.title ? selectedVariant.title : getLocalizedField("title");
    const item: Omit<CartItem, "quantity"> = {
      id: product.id,
      title: activeTitle,
      price: activePrice,
      type: product.type,
      image_key: selectedImage || product.image_key,
      variant_id: selectedVariant?.id || null,
      variant_name: selectedVariant?.title || null,
      delivery_method: selectedDelivery || null,
    };
    addItem(item);
    openCart();
  }

  function handleWhatsAppInquiry() {
    if (!product || !whatsappNumber) return;

    // Fire-and-forget 点击事件
    const visitorId = localStorage.getItem("visitor_id") || "";
    let attributionPayload: Record<string, string | undefined> = {};
    try {
      const stored = localStorage.getItem("attribution");
      if (stored) {
        const a = JSON.parse(stored);
        attributionPayload = {
          utm_source: a.utm_source || undefined,
          utm_medium: a.utm_medium || undefined,
          utm_campaign: a.utm_campaign || undefined,
          utm_content: a.utm_content || undefined,
        };
      }
    } catch { /* ignore */ }

    fetch("/api/track/whatsapp-click", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-visitor-id": visitorId,
      },
      body: JSON.stringify({
        path: window.location.pathname,
        product_id: product.id,
        variant_id: selectedVariant?.id || null,
        locale,
        referrer: document.referrer || undefined,
        ...attributionPayload,
      }),
    }).catch(() => {});

    // 构造 wa.me 链接
    const cleanNumber = whatsappNumber.replace(/[^0-9]/g, "");
    const activeSku = selectedVariant?.sku || "";
    const productTitle = getLocalizedField("title");
    const productPrice = formatPrice(selectedVariant && selectedVariant.price ? Number(selectedVariant.price) : Number(product.price));
    const productUrl = window.location.href;

    let message = whatsappMessage
      .replace(/{product}/g, productTitle)
      .replace(/{sku}/g, activeSku)
      .replace(/{price}/g, productPrice)
      .replace(/{url}/g, productUrl);

    if (!message) {
      message = `${t("product.whatsapp_inquiry")}: ${productTitle}${activeSku ? ` (${activeSku})` : ""} - ${productPrice}\n${productUrl}`;
    }

    window.open(`https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`, "_blank");
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-6">
          <div className="h-5 w-40 rounded-md bg-muted" />
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="aspect-[4/3] rounded-3xl bg-muted" />
              <div className="mt-3 flex gap-2">
                {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 w-16 rounded-xl bg-muted" />)}
              </div>
            </div>
            <div className="space-y-4 lg:col-span-5">
              <div className="h-9 w-3/4 rounded-md bg-muted" />
              <div className="h-4 w-1/2 rounded-md bg-muted" />
              <div className="h-40 rounded-2xl bg-muted" />
              <div className="h-12 rounded-md bg-muted" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 text-center sm:px-6 lg:px-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Package className="h-7 w-7" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-medium">
          {t("product.not_found")}
        </h1>
        <Button asChild className="mt-6">
          <Link href="/products">{t("product.back_to_list")}</Link>
        </Button>
      </div>
    );
  }

  const deliveryLabel: Record<string, string> = {
    online: t("product.online"),
    email: t("product.email"),
    download: t("product.download"),
    shipping: t("product.shipping"),
  };
  const galleryImages = [
    ...(product.image_key ? [{ id: "main", src: product.image_key, alt: getLocalizedField("title"), variant_id: null, position: 0 }] : []),
    ...(product.images || []),
  ].filter((image, index, all) => image.src && all.findIndex((item) => item.src === image.src) === index);
  const activeImage = selectedImage || galleryImages[0]?.src || "";

  const activePrice = selectedVariant?.price ? Number(selectedVariant.price) : Number(product.price);
  const compareAt = product.compare_at_price ? Number(product.compare_at_price) : 0;
  const saving = compareAt > activePrice ? Math.round(((compareAt - activePrice) / compareAt) * 100) : 0;
  const rating = product.rating ?? (reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 4.8);
  const reviewCount = product.review_count ?? reviews.length;
  const highlights = (locale === "zh" ? product.highlights : product.highlights_en || product.highlights) ?? [];
  const methods = parseDeliveryMethods(product.delivery_method);
  const isPhysical = product.type === "physical";
  const lowStock = isPhysical && typeof product.stock === "number" && product.stock > 0 && product.stock <= 15;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 lg:px-8 lg:pb-8">
      <RecentTracker id={product.id} title={getLocalizedField("title")} imageKey={product.image_key} />
      <BreadcrumbPublic
        items={[
          { label: t("crumb.products"), href: "/products" },
          { label: getCategoryName() || t("nav.products"), href: `/products?type=${product.type}` },
          { label: getLocalizedField("title") },
        ]}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
        {/* ── Gallery + story ── */}
        <div className="lg:col-span-7">
          <div className="group relative overflow-hidden rounded-3xl border border-border bg-card shadow-card">
            <div className="relative aspect-[4/3]">
              {activeImage ? (
                <Image
                  src={activeImage}
                  alt={getLocalizedField("title")}
                  fill
                  priority
                  sizes="(min-width: 1024px) 58vw, 100vw"
                  className="object-cover"
                />
              ) : (
                <ProductThumb type={product.type} iconSize="lg" />
              )}
              <WishlistButton productId={product.id} className="absolute right-4 top-4 z-10" />
              {saving > 0 && (
                <span className="absolute left-4 top-4 rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground shadow-card">
                  -{saving}%
                </span>
              )}
            </div>
            {galleryImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto border-t border-border p-3">
                {galleryImages.map((image) => (
                  <button
                    key={image.id || image.src}
                    type="button"
                    onClick={() => setSelectedImage(image.src)}
                    aria-label={image.alt || getLocalizedField("title")}
                    aria-pressed={activeImage === image.src}
                    className={cn("relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border transition-colors duration-200",
                      activeImage === image.src
                        ? "border-primary ring-2 ring-ring/40"
                        : "border-border opacity-70 hover:opacity-100"
                    )}
                  >
                    <Image src={image.src} alt="" fill sizes="64px" className="object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Story */}
          <div className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge className="border-transparent bg-primary-soft text-primary hover:bg-primary-soft">
                {t(`product.type.${product.type}`)}
              </Badge>
              {product.categories && <Badge variant="outline">{getCategoryName()}</Badge>}
              {product.vendor && (
                <span className="text-[11px] font-medium text-muted-foreground">
                  {product.vendor}
                </span>
              )}
            </div>

            <h1 className="font-display text-balance text-2xl font-medium leading-tight sm:text-3xl">
              {getLocalizedField("title")}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
              <span className="inline-flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn("h-3.5 w-3.5", i < Math.round(rating) ? "text-amber-500" : "text-border")}
                    weight={i < Math.round(rating) ? "fill" : "regular"}
                  />
                ))}
                <span className="ml-1 font-medium">{rating.toFixed(1)}</span>
                <span className="text-muted-foreground">({reviewCount})</span>
              </span>
              {typeof product.sold_count === "number" && product.sold_count > 0 && (
                <span className="text-muted-foreground">
                  {product.sold_count.toLocaleString()} {t("product.sold")}
                </span>
              )}
            </div>

            <p className="mt-5 whitespace-pre-line text-[14.5px] leading-relaxed text-muted-foreground">
              {getLocalizedField("description")}
            </p>

            {highlights.length > 0 && (
              <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                {highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 rounded-xl bg-muted/60 px-4 py-2 text-[13px] leading-relaxed">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" weight="bold" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            )}

            <Separator className="my-6" />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {product.duration && (
                <div className="rounded-2xl border border-border bg-muted/40 p-4">
                  <Clock className="h-4 w-4 text-primary" />
                  <p className="mt-2 text-[11px] text-muted-foreground">{t("product.duration")}</p>
                  <p className="mt-1 text-sm font-medium">{product.duration}</p>
                </div>
              )}
              {product.delivery_method && (
                <div className="rounded-2xl border border-border bg-muted/40 p-4">
                  <span className="text-primary">
                    {deliveryIcons[methods[0]] || <WifiHigh className="h-4 w-4" />}
                  </span>
                  <p className="mt-2 text-[11px] text-muted-foreground">{t("product.delivery")}</p>
                  <p className="mt-1 text-sm font-medium">
                    {methods.length > 1 ? t("product.multi_delivery") : (deliveryLabel[methods[0]] || methods[0])}
                  </p>
                </div>
              )}
              <div className="rounded-2xl border border-border bg-muted/40 p-4">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <p className="mt-2 text-[11px] text-muted-foreground">{t("product.secure")}</p>
                <p className="mt-1 text-sm font-medium">{t("product.ssl_encrypted")}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Buy box ── */}
        <div className="lg:col-span-5">
          <Card className="sticky top-24 rounded-3xl shadow-lift">
            <CardContent className="p-6">
              <div className="flex items-end gap-3">
                <span className="font-display text-4xl font-medium">
                  {formatPrice(activePrice)}
                </span>
                {compareAt > activePrice && (
                  <span className="pb-1 text-sm text-muted-foreground line-through">
                    {formatPrice(compareAt)}
                  </span>
                )}
              </div>
              {saving > 0 && (
                <p className="mt-2 text-[12.5px] font-medium text-emerald-600 dark:text-emerald-400">
                  {t("product.you_save")} {formatPrice(compareAt - activePrice)} ({saving}%)
                </p>
              )}

              {isPhysical && typeof product.stock === "number" && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className={cn("font-medium", lowStock ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                      {lowStock ? t("product.low_stock") : t("product.in_stock")}
                    </span>
                    <span className="font-mono text-muted-foreground">{product.stock}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-md bg-muted">
                    <div
                      className={cn("h-full rounded-full transition-colors duration-200", lowStock ? "bg-amber-500" : "bg-emerald-500")}
                      style={{ width: `${Math.min(100, Math.max(8, (product.stock / 120) * 100))}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Variant selector */}
              {variants.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 text-[12px] font-medium text-muted-foreground">
                    {t("product.variants")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {variants.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVariant(selectedVariant?.id === v.id ? null : v)}
                        className={cn("rounded-md border px-4 py-1.5 text-[13px] transition-colors duration-200",
                          selectedVariant?.id === v.id
                            ? "border-primary bg-primary-soft font-medium text-primary"
                            : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground"
                        )}
                      >
                        {v.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Delivery method selector */}
              {methods.length > 1 && (
                <div className="mt-5">
                  <p className="mb-2 text-[12px] font-medium text-muted-foreground">
                    {t("product.delivery")}
                  </p>
                  <div className="space-y-2">
                    {methods.map((code) => {
                      const def = getDeliveryMethodByCode(code);
                      return (
                        <label
                          key={code}
                          className={cn("flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm transition-colors duration-200",
                            selectedDelivery === code
                              ? "border-primary bg-primary-soft text-primary"
                              : "border-border hover:border-border-strong"
                          )}
                        >
                          <input
                            type="radio"
                            name="delivery_method"
                            value={code}
                            checked={selectedDelivery === code}
                            onChange={() => setSelectedDelivery(code)}
                            className="sr-only"
                          />
                          <span className="text-primary">{deliveryIcons[code]}</span>
                          <span className="font-medium">{def?.label || deliveryLabel[code] || code}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-6 space-y-2">
                <Button onClick={handleAddToCart} size="lg" className="w-full">
                  <ShoppingCart className="mr-1 h-4 w-4" />
                  {t("product.add_to_cart")}
                </Button>
                <Button asChild onClick={handleAddToCart} size="lg" variant="outline" className="w-full">
                  <Link href="/cart">{t("product.buy_now")}</Link>
                </Button>
                {whatsappNumber && (
                  <Button
                    onClick={handleWhatsAppInquiry}
                    variant="ghost"
                    size="lg"
                    className="w-full gap-2 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                  >
                    <WhatsappLogo className="h-4 w-4" weight="fill" />
                    {t("product.whatsapp_inquiry")}
                  </Button>
                )}
              </div>

              <Separator className="my-6" />

              <div className="space-y-2 text-[13px]">
                {[
                  t("product.payment_secure"),
                  isPhysical ? t("product.tracked_shipping") : t("product.instant_delivery"),
                  t("product.refund_7day"),
                  t("product.support_24_7"),
                ].map((line) => (
                  <div key={line} className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" weight="fill" />
                    {line}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Recommendations ── */}
      {recommendations.length > 0 && (
        <Reveal className="mt-16">
          <h2 className="mb-5 font-display text-xl font-medium sm:text-2xl">
            {t("product.recommendations")}
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {recommendations.slice(0, 4).map((rec) => (
              <Link key={rec.id} href={`/products/${rec.id}`} className="group">
                <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-colors duration-200">
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <ProductThumb
                      type={rec.type || "virtual"}
                      image={rec.image_key}
                      alt={rec.title}
                      sizes="(min-width: 1024px) 22vw, 50vw"
                    />
                  </div>
                  <div className="p-4">
                    <p className="line-clamp-1 text-[13.5px] font-medium transition-colors group-hover:text-primary">
                      {locale === "zh" ? rec.title : rec.title_en || rec.title}
                    </p>
                    <p className="mt-1 font-mono text-sm font-medium">{formatPrice(Number(rec.price || 0))}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Reveal>
      )}

      {/* ── Reviews ── */}
      <div className="mt-16">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-xl font-medium sm:text-2xl">
            {t("product.reviews")}
          </h2>
          {reviews.length > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 shadow-card">
              <span className="font-display text-lg font-medium">{rating.toFixed(1)}</span>
              <span className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={cn("h-3.5 w-3.5", i < Math.round(rating) ? "text-amber-500" : "text-border")} weight={i < Math.round(rating) ? "fill" : "regular"} />
                ))}
              </span>
              <span className="text-[12px] text-muted-foreground">{reviewCount}</span>
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Write a review */}
          <Card className="self-start lg:col-span-4 lg:sticky lg:top-24">
            <CardContent className="p-5">
              <p className="mb-3 text-[13px] font-medium">{t("product.submit_review")}</p>
              <div className="mb-3 flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setReviewForm({ ...reviewForm, rating: star })}
                    aria-label={t("product.stars_aria").replace("{n}", String(star))}
                    className="transition-transform duration-150"
                  >
                    <Star className={cn("h-5 w-5", star <= reviewForm.rating ? "text-amber-500" : "text-border")} weight={star <= reviewForm.rating ? "fill" : "regular"} />
                  </button>
                ))}
                <span className="ml-1.5 text-[12px] text-muted-foreground">{reviewForm.rating}/5</span>
              </div>
              <input
                className="mb-2 w-full rounded-xl border border-input bg-card px-4 py-2 text-sm outline-none transition-colors duration-200 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
                placeholder={t("product.review_title_placeholder")}
                value={reviewForm.title}
                onChange={(e) => setReviewForm({ ...reviewForm, title: e.target.value })}
              />
              <textarea
                className="mb-3 w-full rounded-xl border border-input bg-card px-4 py-2 text-sm outline-none transition-colors duration-200 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
                rows={3}
                placeholder={t("product.review_content_placeholder")}
                value={reviewForm.content}
                onChange={(e) => setReviewForm({ ...reviewForm, content: e.target.value })}
              />
              <Button size="sm" onClick={submitReview} disabled={submitting} className="w-full">
                {submitting ? t("product.submitting") : t("product.submit_review")}
              </Button>
            </CardContent>
          </Card>

          {/* Review list */}
          <div className="space-y-3 lg:col-span-8">
            {reviews.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card py-14 text-center shadow-card">
                <p className="text-sm text-muted-foreground">{t("product.no_reviews_yet")}</p>
              </div>
            ) : (
              reviews.map((rv) => (
                <Card key={rv.id} className="rounded-2xl">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-[12px] font-medium text-primary">
                          {(rv.author || "GT").slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium">{rv.author || t("brand.short")}</span>
                            {rv.is_verified && (
                              <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                <SealCheck className="h-3 w-3" weight="fill" />
                                {t("product.verified_purchase")}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} className={cn("h-3 w-3", i < rv.rating ? "text-amber-500" : "text-border")} weight={i < rv.rating ? "fill" : "regular"} />
                            ))}
                          </div>
                        </div>
                      </div>
                      <span className="shrink-0 text-[11.5px] text-muted-foreground">
                        {new Date(rv.created_at).toLocaleDateString(locale === "zh" ? "zh-CN" : locale === "pt" ? "pt-BR" : "en-US")}
                      </span>
                    </div>
                    {rv.title && <p className="mt-3 text-[13.5px] font-medium">{rv.title}</p>}
                    <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">{rv.content}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      <StickyBuyBar
        title={getLocalizedField("title")}
        imageKey={activeImage || product.image_key}
        priceLabel={formatPrice(activePrice)}
        onAdd={handleAddToCart}
        disabled={variants.length > 0 && !selectedVariant}
        ctaLabel={variants.length > 0 && !selectedVariant ? t("quick.pick_variant") : t("product.add_to_cart")}
      />
    </div>
  );
}