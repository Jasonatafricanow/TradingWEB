"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useI18n } from "@/contexts/i18n-context";
import { useCart } from "@/contexts/cart-context";
import { useCurrency } from "@/contexts/currency-context";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MagnifyingGlass,
  ShoppingCart,
  Clock,
  Download,
  Envelope,
  WifiHigh,
  Briefcase,
  Stack,
  Truck,
  Star,
  ArrowRight,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { BreadcrumbPublic } from "@/components/breadcrumb-public";
import { useTheme } from "@/contexts/theme-context";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CategoryInfo {
  id: string;
  name: string;
  name_en: string | null;
  name_ja: string | null;
  name_es: string | null;
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
  categories: CategoryInfo | null;
}

// ─── Design config ────────────────────────────────────────────────────────────

const TYPE_VISUAL: Record<string, { gradient: string; iconColor: string }> = {
  service: {
    gradient:
      "radial-gradient(ellipse 90% 90% at 20% 15%, #dbeafe 0%, #eff6ff 55%, #f0f9ff 100%)",
    iconColor: "#2563eb",
  },
  virtual: {
    gradient:
      "radial-gradient(ellipse 90% 90% at 20% 15%, #ede9fe 0%, #f5f3ff 55%, #fdf4ff 100%)",
    iconColor: "#7c3aed",
  },
  physical: {
    gradient:
      "radial-gradient(ellipse 90% 90% at 20% 15%, #dcfce7 0%, #f0fdf4 55%, #f7fee7 100%)",
    iconColor: "#16a34a",
  },
};

const DELIVERY_META: Record<string, { icon: React.ReactNode; label: string }> = {
  online:   { icon: <WifiHigh className="h-3 w-3" />,  label: "product.online" },
  email:    { icon: <Envelope className="h-3 w-3" />,  label: "product.email" },
  download: { icon: <Download className="h-3 w-3" />,  label: "product.download" },
  shipping: { icon: <Truck className="h-3 w-3" />, label: "product.shipping" },
};

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  onAddToCart,
  getTitle,
  getDesc,
  getCategoryName,
  formatPrice,
  t,
}: {
  product: Product;
  onAddToCart: (p: Product) => void;
  getTitle: (p: Product) => string;
  getDesc: (p: Product) => string;
  getCategoryName: (p: Product) => string;
  formatPrice: (n: number) => string;
  t: (k: string) => string;
}) {
  const router = useRouter();
  const visual = TYPE_VISUAL[product.type] ?? TYPE_VISUAL.service;
  const delivery = product.delivery_method ? DELIVERY_META[product.delivery_method] : null;
  const Icon = product.type === "service" ? Briefcase : product.type === "physical" ? Truck : Stack;

  const { theme } = useTheme();
  if (theme === "shopify") {
    const ratingVal = 5 - (product.id.charCodeAt(product.id.length - 1) % 2) * 0.1;
    const reviewCnt = (product.id.charCodeAt(0) % 20) + 12;

    return (
      <div
        className="group relative overflow-hidden bg-white border border-[#e2e8f0] rounded-none p-0 transition-all duration-300 shadow-sm hover:shadow-md hover:border-slate-400 flex flex-col justify-between cursor-pointer"
        onClick={() => router.push(`/products/${product.id}`)}
      >
        {/* Visual area */}
        <div className="relative aspect-square w-full overflow-hidden bg-slate-50 border-b border-slate-100 flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm text-slate-800">
            <Icon className="h-6 w-6" />
          </div>
          {product.categories && (
            <span className="absolute top-3 left-3 bg-slate-900 text-white text-[9px] font-bold tracking-widest uppercase px-2 py-0.5">
              {getCategoryName(product)}
            </span>
          )}
          <div className="absolute inset-x-3 bottom-3 translate-y-8 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 z-20">
            <button
              className="w-full bg-white text-slate-900 border border-slate-950 hover:bg-slate-900 hover:text-white text-xs font-bold py-2.5 tracking-wider uppercase transition-colors flex items-center justify-center gap-1.5 shadow-sm"
              onClick={(e) => {
                e.stopPropagation();
                onAddToCart(product);
              }}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              {t("product.add_to_cart")}
            </button>
          </div>
        </div>

        {/* Info Area */}
        <div className="p-4 flex flex-col items-center text-center">
          {/* Ratings */}
          <div className="flex items-center gap-1 mb-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn(
                  "h-3 w-3",
                  i < Math.floor(ratingVal) ? "fill-slate-900 text-slate-900" : "text-slate-200"
                )}
                weight={i < Math.floor(ratingVal) ? "fill" : "regular"}
              />
            ))}
            <span className="text-[10px] text-slate-400 ml-1">({reviewCnt})</span>
          </div>

          <h3 className="font-serif text-[15px] font-semibold text-slate-900 hover:text-slate-500 transition-colors line-clamp-1">
            {getTitle(product)}
          </h3>
          <p className="mt-1 text-xs text-slate-500 line-clamp-1">
            {getDesc(product)}
          </p>

          <div className="mt-3 flex items-center justify-center gap-2">
            <span className="text-sm font-bold text-slate-900 font-mono">
              {formatPrice(parseFloat(product.price))}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Original Card Fallback
  return (
    <div
      className="group relative flex cursor-pointer flex-col rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-px hover:border-gray-300 hover:shadow-lg"
      onClick={() => router.push(`/products/${product.id}`)}
    >
      {/* Visual area */}
      <div
        className="relative flex h-[116px] items-center justify-center overflow-hidden rounded-t-2xl"
        style={{ background: visual.gradient }}
      >
        {/* Dot grid texture */}
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "radial-gradient(circle, #94a3b8 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        />
        {/* Icon */}
        <div
          className="relative z-10 flex h-12 w-12 items-center justify-center rounded-xl border border-white/90 bg-white/80 backdrop-blur-sm"
          style={{
            color: visual.iconColor,
            boxShadow: "0 2px 8px rgba(0,0,0,.08)",
          }}
        >
          <Icon className="h-5 w-5" weight="duotone" />
        </div>
        {/* Category pill */}
        {product.categories && (
          <span className="absolute bottom-2.5 left-3 rounded-full border border-white/90 bg-white/75 px-2.5 py-0.5 text-[11px] font-medium text-gray-500 backdrop-blur-sm">
            {getCategoryName(product)}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col px-5 pt-4 pb-0">
        <h3 className="line-clamp-2 text-[14.5px] font-semibold leading-snug text-gray-900 transition-colors group-hover:text-blue-600">
          {getTitle(product)}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-gray-500">
          {getDesc(product)}
        </p>

        {/* Meta row */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-gray-400">
          {delivery && (
            <span className="flex items-center gap-1">
              {delivery.icon}
              {t(delivery.label)}
            </span>
          )}
          {product.duration && (
            <>
              <span className="h-3 w-px bg-gray-200" />
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {product.duration}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 px-5 pb-5">
        <div className="mb-4 h-px bg-gray-100" />
        <div className="flex items-center justify-between gap-3">
          <div>
            {(product as any).price_min && (product as any).price_max && (product as any).price_min !== (product as any).price_max ? (
              <span className="text-[22px] font-bold tracking-tight text-gray-900">
                {formatPrice(parseFloat((product as any).price_min))} – {formatPrice(parseFloat((product as any).price_max))}
              </span>
            ) : (
              <span className="text-[22px] font-bold tracking-tight text-gray-900">
                {formatPrice(parseFloat(product.price))}
              </span>
            )}
            {product.type === "service" && (
              <span className="ml-1 text-xs text-gray-400">/ {t("product.per_session")}</span>
            )}
          </div>
          <button
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 px-3.5 py-2 text-[13px] font-semibold text-white shadow-md shadow-blue-500/30 transition-all duration-150 hover:shadow-lg hover:shadow-blue-500/40 hover:opacity-95 active:scale-95"
            onClick={(e) => {
              e.stopPropagation();
              onAddToCart(product);
            }}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            {t("product.add_to_cart")}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ProductSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-gray-100 bg-white overflow-hidden"
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
      <div className="h-[116px] bg-gray-100" />
      <div className="px-5 pt-4 pb-5">
        <div className="h-4 w-2/3 rounded-md bg-gray-200" />
        <div className="mt-2 h-3 w-full rounded-md bg-gray-100" />
        <div className="mt-1 h-3 w-4/5 rounded-md bg-gray-100" />
        <div className="mt-6 h-px bg-gray-100" />
        <div className="mt-4 flex items-center justify-between">
          <div className="h-6 w-20 rounded-md bg-gray-200" />
          <div className="h-8 w-28 rounded-xl bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function ProductsContent() {
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();
  const { addItem } = useCart();
  const { format: formatPrice } = useCurrency();
  const [products, setProducts] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [categoryFilter, setCategoryFilter] = useState("all");

  useEffect(() => {
    const type = searchParams.get("type");
    if (type) setTypeFilter(type);
    const cat = searchParams.get("category");
    if (cat) setCategoryFilter(cat);
  }, [searchParams]);

  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, sortBy]);

  // Client-side filter/search on type change (instant)
  useEffect(() => {
    applyFilters(allProducts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, searchQuery, allProducts]);

  async function fetchProducts() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter && categoryFilter !== "all") params.set("category", categoryFilter);
      const res = await fetch(`/api/products?${params.toString()}`);
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      const data: Product[] = result.data || [];
      setAllProducts(data);
      applyFilters(data);
    } catch (err) {
      console.error("Failed to fetch products:", err);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters(data: Product[]) {
    let filtered = [...data];
    if (typeFilter && typeFilter !== "all") {
      filtered = filtered.filter((p) => p.type === typeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((p) => {
        const title = getLocalizedField(p, "title").toLowerCase();
        const desc = getLocalizedField(p, "description").toLowerCase();
        return title.includes(q) || desc.includes(q);
      });
    }
    if (sortBy === "price_asc") filtered.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    else if (sortBy === "price_desc") filtered.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
    setProducts(filtered);
  }

  function getLocalizedField(product: Product, field: string): string {
    const record = product as unknown as Record<string, unknown>;
    if (locale === "zh") return (record[field] as string) || "";
    const localizedKey = `${field}_${locale}`;
    return (
      (record[localizedKey] as string) ||
      (record[`${field}_en`] as string) ||
      (record[field] as string) ||
      ""
    );
  }

  function getCategoryName(product: Product): string {
    if (!product.categories) return "";
    if (locale === "zh") return product.categories.name;
    const record = product.categories as unknown as Record<string, unknown>;
    return (
      (record[`name_${locale}`] as string) ||
      (record.name_en as string) ||
      product.categories.name
    );
  }

  function handleAddToCart(product: Product) {
    addItem({
      id: product.id,
      title: getLocalizedField(product, "title"),
      price: parseFloat(product.price),
      type: product.type,
    });
    toast.success(t("product.add_to_cart_success"));
  }

  const tabs = [
    { value: "all",     label: t("filter.all"),     count: allProducts.length },
    { value: "service", label: t("filter.service"),  count: allProducts.filter((p) => p.type === "service").length },
    { value: "virtual", label: t("filter.virtual"),  count: allProducts.filter((p) => p.type === "virtual").length },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">

      <BreadcrumbPublic items={[{ label: t("crumb.products") }]} />

      {/* ── Page header ── */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-blue-600">
            {t("home.cat.title")}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-[26px]">
            {t("nav.products")}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{t("product.explore_desc")}</p>
        </div>
        {/* Search */}
        <div className="relative shrink-0 sm:w-64">
          <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder={t("search.placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-sm"
          />
        </div>
      </div>

      {/* ── Tab filter + Sort ── */}
      <div className="mb-6 flex items-center justify-between gap-4 border-b border-gray-200">
        {/* Tabs */}
        <div className="flex items-center">
          {tabs.map((tab) => {
            const active = typeFilter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setTypeFilter(tab.value)}
                className={cn(
                  "relative flex items-center gap-1.5 px-4 py-2.5 text-[13.5px] font-medium transition-colors",
                  active ? "text-blue-600" : "text-gray-500 hover:text-gray-900"
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                    active ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                  )}
                >
                  {tab.count}
                </span>
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-blue-600" />
                )}
              </button>
            );
          })}
        </div>
        {/* Sort */}
        <div className="pb-1">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 w-[148px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{t("sort.newest")}</SelectItem>
              <SelectItem value="price_asc">{t("sort.price_asc")}</SelectItem>
              <SelectItem value="price_desc">{t("sort.price_desc")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Results ── */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <ProductSkeleton key={i} />)}
        </div>
      ) : products.length === 0 ? (
        <div className="py-24 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
            <MagnifyingGlass className="h-7 w-7 text-gray-400" />
          </div>
          <p className="text-[15px] font-medium text-gray-700">{t("product.no_products_found")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={handleAddToCart}
              getTitle={(p) => getLocalizedField(p, "title")}
              getDesc={(p) => getLocalizedField(p, "description")}
              getCategoryName={getCategoryName}
              formatPrice={formatPrice}
              t={t}
            />
          ))}
        </div>
      )}

      {/* ── Bottom ── */}
      {!loading && products.length > 0 && (
        <div className="mt-10 flex items-center justify-between text-sm text-gray-400">
          <span>
            {t("filter.showing") || "Showing"}{" "}
            <span className="font-medium text-gray-600">{products.length}</span>{" "}
            {t("filter.of") || "of"}{" "}
            <span className="font-medium text-gray-600">{allProducts.length}</span>{" "}
            {t("nav.products").toLowerCase()}
          </span>
        </div>
      )}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-8 h-8 w-48 animate-pulse rounded-lg bg-gray-200" />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-72 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        </div>
      }
    >
      <ProductsContent />
    </Suspense>
  );
}
