"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { useI18n } from "@/contexts/i18n-context";
import { useCart } from "@/contexts/cart-context";
import { useCurrency } from "@/contexts/currency-context";
import { productJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { Star } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ShoppingCart,
  Clock,
  Download,
  Envelope,
  WifiHigh,
  ArrowLeft,
  CheckCircle,
  ShieldCheck,
  Truck,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import Link from "next/link";
import { parseDeliveryMethods, getDeliveryMethodByCode } from "@/config/delivery-methods";
import type { CartItem } from "@/contexts/cart-context";

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
}

interface ProductReview {
  id: string;
  rating: number;
  title: string;
  content: string;
  created_at: string;
}

interface ProductRecommendation {
  id: string;
  title: string;
  price: string | number;
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
    fetch("/api/admin/settings")
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
    fetch("/api/reviews", {
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
    toast.success(t("product.add_to_cart_success"));
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
          <div className="h-6 w-32 rounded bg-gray-200" />
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div className="h-96 rounded-xl bg-gray-100" />
            <div className="space-y-4">
              <div className="h-8 w-3/4 rounded bg-gray-200" />
              <div className="h-4 w-1/2 rounded bg-gray-100" />
              <div className="h-32 rounded bg-gray-100" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {t("product.not_found")}
        </h1>
        <Link href="/products">
          <Button className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("product.back_to_list")}
          </Button>
        </Link>
      </div>
    );
  }

  const deliveryLabel: Record<string, string> = {
    online: t("product.online"),
    email: t("product.email"),
    download: t("product.download"),
  };
  const galleryImages = [
    ...(product.image_key ? [{ id: "main", src: product.image_key, alt: getLocalizedField("title"), variant_id: null, position: 0 }] : []),
    ...(product.images || []),
  ].filter((image, index, all) => image.src && all.findIndex((item) => item.src === image.src) === index);
  const activeImage = selectedImage || galleryImages[0]?.src || "";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link href="/products" className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" />
          {t("product.back_to_list")}
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {galleryImages.length > 0 && (
            <div className="mb-6 overflow-hidden rounded-2xl border bg-white">
              <div className="aspect-[4/3] bg-gray-50">
                <div
                  role="img"
                  aria-label={getLocalizedField("title")}
                  className="h-full w-full bg-contain bg-center bg-no-repeat"
                  style={{ backgroundImage: `url(${activeImage})` }}
                />
              </div>
              {galleryImages.length > 1 && (
                <div className="flex gap-2 overflow-x-auto border-t p-3">
                  {galleryImages.map((image) => (
                    <button
                      key={image.id || image.src}
                      type="button"
                      onClick={() => setSelectedImage(image.src)}
                      className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-gray-50 ${
                        activeImage === image.src ? "ring-2 ring-blue-500" : ""
                      }`}
                    >
                      <div
                        role="img"
                        aria-label={image.alt || getLocalizedField("title")}
                        className="h-full w-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${image.src})` }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="overflow-hidden rounded-2xl border">
            <div className={`h-3 bg-gradient-to-r ${product.type === "service" ? "from-blue-500 to-blue-600" : "from-blue-400 to-blue-600"}`} />
            <div className="p-8">
              <div className="flex items-center gap-3 mb-4">
                <Badge className={product.type === "service" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"} variant="secondary">
                  {t(`product.type.${product.type}`)}
                </Badge>
                {product.categories && (
                  <Badge variant="outline">{getCategoryName()}</Badge>
                )}
              </div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-900">
                  {getLocalizedField("title")}
                </h1>
                {!product.meta_title && !product.meta_description && (
                  <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                    SEO未优化
                  </span>
                )}
              </div>
              <p className="mt-4 text-gray-600 leading-relaxed whitespace-pre-line">
                {getLocalizedField("description")}
              </p>

              <Separator className="my-6" />

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {product.duration && (
                  <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-4">
                    <Clock className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="text-xs text-gray-400">{t("product.duration")}</p>
                      <p className="text-sm font-semibold">{product.duration}</p>
                    </div>
                  </div>
                )}
                {product.delivery_method && (() => {
                  const methods = parseDeliveryMethods(product.delivery_method);
                  const firstMethod = methods[0];
                  const icon = firstMethod && deliveryIcons[firstMethod]
                    ? deliveryIcons[firstMethod]
                    : <WifiHigh className="h-4 w-4" />;
                  const label = methods.length > 1
                    ? "多种交付方式可选"
                    : (deliveryLabel[firstMethod] || firstMethod);
                  return (
                    <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-4">
                      {icon}
                      <div>
                        <p className="text-xs text-gray-400">{t("product.delivery")}</p>
                        <p className="text-sm font-semibold">{label}</p>
                      </div>
                    </div>
                  );
                })()}
                <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-4">
                  <ShieldCheck className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-xs text-gray-400">
                      {t("product.secure")}
                    </p>
                    <p className="text-sm font-semibold">
                      {t("product.ssl_encrypted")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <Card className="sticky top-20">
            <CardContent className="p-6">
              <div className="text-center">
                <span className="text-4xl font-bold text-gray-900">
                  {formatPrice(selectedVariant && selectedVariant.price ? Number(selectedVariant.price) : Number(product.price))}
                </span>
                <span className="ml-2 text-gray-400">USD</span>
              </div>

              {/* Variant selector */}
              {variants.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">规格选项</p>
                  <div className="flex flex-wrap gap-2">
                    {variants.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVariant(selectedVariant?.id === v.id ? null : v)}
                        className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${
                          selectedVariant?.id === v.id
                            ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                            : "border-gray-200 hover:border-gray-300 text-gray-600"
                        }`}
                      >
                        {v.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Delivery method selector */}
              {(() => {
                const methods = parseDeliveryMethods(product.delivery_method);
                if (methods.length > 1) {
                  return (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">交付方式</p>
                      <div className="space-y-2">
                        {methods.map((code) => {
                          const def = getDeliveryMethodByCode(code);
                          return (
                            <label
                              key={code}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${
                                selectedDelivery === code
                                  ? "border-blue-500 bg-blue-50 text-blue-700"
                                  : "border-gray-200 hover:border-gray-300"
                              }`}
                            >
                              <input
                                type="radio"
                                name="delivery_method"
                                value={code}
                                checked={selectedDelivery === code}
                                onChange={() => setSelectedDelivery(code)}
                                className="sr-only"
                              />
                              <span>{def?.label || code}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="mt-6 space-y-3">
                <Button
                  onClick={handleAddToCart}
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  {t("product.add_to_cart")}
                </Button>
                <Link href="/cart" className="block">
                  <Button
                    onClick={handleAddToCart}
                    size="lg"
                    className="w-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    {t("product.buy_now")}
                  </Button>
                </Link>
                {whatsappNumber && (
                  <Button
                    onClick={handleWhatsAppInquiry}
                    variant="outline"
                    size="lg"
                    className="w-full gap-2 border-green-500 text-green-700 hover:bg-green-50"
                  >
                    <WhatsappLogo className="h-4 w-4" />
                    {t("product.whatsapp_inquiry")}
                  </Button>
                )}
              </div>

              <Separator className="my-6" />

              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  {t("product.payment_secure")}
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  {t("product.instant_delivery")}
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  {t("product.refund_7day")}
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  {t("product.support_24_7")}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 推荐商品 */}
      {recommendations.length > 0 && (
        <div className="mt-12">
          <h2 className="text-xl font-bold mb-4">{t("product.recommendations")}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {recommendations.map((rec) => (
              <Link key={rec.id} href={`/products/${rec.id}`}>
                <Card className="card-hover">
                  <CardContent className="p-4">
                    <p className="font-medium text-sm truncate">{rec.title}</p>
                    <p className="text-blue-600 font-bold mt-1">{formatPrice(Number(rec.price || 0))}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 评论 */}
      <div className="mt-12">
        <h2 className="text-xl font-bold mb-4">{t("product.reviews")}</h2>

        {/* 发表评论 */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} onClick={() => setReviewForm({ ...reviewForm, rating: star })}>
                  <Star className={`h-5 w-5 ${star <= reviewForm.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`} />
                </button>
              ))}
              <span className="text-sm text-muted-foreground ml-2">{reviewForm.rating}/5</span>
            </div>
            <input className="w-full mb-2 px-3 py-2 border rounded-md text-sm" placeholder={t("product.review_title_placeholder")} value={reviewForm.title} onChange={(e) => setReviewForm({ ...reviewForm, title: e.target.value })} />
            <textarea className="w-full mb-2 px-3 py-2 border rounded-md text-sm" rows={3} placeholder={t("product.review_content_placeholder")} value={reviewForm.content} onChange={(e) => setReviewForm({ ...reviewForm, content: e.target.value })} />
            <Button size="sm" onClick={submitReview} disabled={submitting}>{submitting ? t("product.submitting") : t("product.submit_review")}</Button>
          </CardContent>
        </Card>

        {/* 评论列表 */}
        <div className="space-y-4">
          {reviews.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("product.no_reviews_yet")}</p>
          ) : (
            reviews.map((rv) => (
              <Card key={rv.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className={`h-4 w-4 ${s <= rv.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-200"}`} />
                    ))}
                    <span className="text-sm font-medium ml-1">{rv.title}</span>
                  </div>
                  <p className="text-sm text-gray-600">{rv.content}</p>
                  <p className="text-xs text-muted-foreground mt-2">{new Date(rv.created_at).toLocaleDateString()}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
