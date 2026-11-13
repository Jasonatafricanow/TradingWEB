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
  Truck,
  Star,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { BreadcrumbPublic } from "@/components/breadcrumb-public";
import { ProductThumb } from "@/components/product-thumb";
import { useTheme } from "@/contexts/theme-context";
import { Eye } from "@phosphor-icons/react";
import { QuickView } from "@/components/quick-view";
import { WishlistButton } from "@/components/wishlist-button";
import { useUI } from "@/contexts/ui-context";

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
  onQuickView,
  getTitle,
  getDesc,
  getCategoryName,
  formatPrice,
  t,
}: {
  product: Product;
  onAddToCart: (p: Product) => void;
  onQuickView: (id: string) => void;
  getTitle: (p: Product) => string;
  getDesc: (p: Product) => string;
  getCategoryName: (p: Product) => string;
  formatPrice: (n: number) => string;
  t: (k: string) => string;
}) {
  const router = useRouter();
  const delivery = product.delivery_method ? DELIVERY_META[product.delivery_method] : null;

  const { theme } = useTheme();
  if (theme === "shopify") {
    const ratingVal = 5 - (product.id.charCodeAt(product.id.length - 1) % 2) * 0.1;
    const reviewCnt = (product.id.charCodeAt(0) % 20) + 12;

    return (
      <div
        className="group relative overflow-hidden bg-card border border-border rounded-2xl p-0 transition-colors duration-200 ease-out shadow-card flex flex-col justify-between cursor-pointer"
        onClick={() => router.push(`/products/${product.id}`)}
      >
        {/* Visual area */}
        <div className="relative aspect-square w-full overflow-hidden border-b border-border-subtle">
          <ProductThumb type={product.type} image={product.image_key} alt={getTitle(product)} />
          {product.categories && (
            <span className="absolute top-3 left-3 rounded-md bg-primary text-primary-foreground text-[11px] font-medium px-3 py-1">
              {getCategoryName(product)}
            </span>
          )}
          <div className="absolute right-3 top-3 z-20 flex gap-1.5 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
            <button
              aria-label={t("quick.view")}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card/95 text-muted-foreground shadow-card transition-colors hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onQuickView(product.id); }}
            >
              <Eye className="h-4 w-4" />
            </button>
            <WishlistButton productId={product.id} />
          </div>
          <div className="absolute inset-x-3 bottom-3 translate-y-2 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-y-0 group-hover:opacity-100 z-20">
            <button
              className="w-full rounded-md bg-card/95 backdrop-blur-md text-foreground border border-border hover:bg-primary hover:text-primary-foreground text-xs font-medium py-2 transition-colors flex items-center justify-center gap-2 shadow-card"
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
          <div className="flex items-center gap-1 mb-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn("h-3 w-3",
                  i < Math.floor(ratingVal) ? "text-amber-500" : "text-border"
                )}
                weight={i < Math.floor(ratingVal) ? "fill" : "regular"}
              />
            ))}
            <span className="text-[11px] text-muted-foreground ml-1">({reviewCnt})</span>
          </div>

          <h3 className="font-display text-[15px] font-medium text-foreground hover:text-muted-foreground transition-colors line-clamp-1">
            {getTitle(product)}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
            {getDesc(product)}
          </p>

          <div className="mt-3 flex items-center justify-center gap-2">
            <span className="text-sm font-medium text-foreground font-mono">
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
      className="group relative flex cursor-pointer flex-col rounded-2xl border border-border bg-card shadow-card transition-colors duration-200 ease-out"
      onClick={() => router.push(`/products/${product.id}`)}
    >
      {/* Visual area */}
      <div className="relative h-[116px] overflow-hidden rounded-t-2xl">
        <ProductThumb type={product.type} image={product.image_key} alt={getTitle(product)} />
        {/* Category pill */}
        {product.categories && (
          <span className="absolute bottom-2.5 left-3 rounded-md border border-border bg-card/80 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur-sm">
            {getCategoryName(product)}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col px-5 pt-4 pb-0">
        <h3 className="line-clamp-2 text-[14.5px] font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
          {getTitle(product)}
        </h3>
        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
          {getDesc(product)}
        </p>

        {/* Meta row */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
          {delivery && (
            <span className="flex items-center gap-1">
              {delivery.icon}
              {t(delivery.label)}
            </span>
          )}
          {product.duration && (
            <>
              <span className="h-3 w-px bg-border" />
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
        <div className="mb-4 h-px bg-border-subtle" />
        <div className="flex items-center justify-between gap-3">
          <div>
            {(product as any).price_min && (product as any).price_max && (product as any).price_min !== (product as any).price_max ? (
              <span className="text-[22px] font-medium text-foreground">
                {formatPrice(parseFloat((product as any).price_min))} – {formatPrice(parseFloat((product as any).price_max))}
              </span>
            ) : (
              <span className="text-[22px] font-medium text-foreground">
                {formatPrice(parseFloat(product.price))}
              </span>
            )}
            {product.type === "service" && (
              <span className="ml-1 text-xs text-muted-foreground">/ {t("product.per_session")}</span>
            )}
          </div>
          <button
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground shadow-card transition-colors duration-200 ease-out hover:bg-primary-deep active:scale-95"
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
    <div className="animate-pulse rounded-2xl border border-border bg-card overflow-hidden shadow-card">
      <div className="h-[116px] bg-muted" />
      <div className="px-5 pt-4 pb-5">
        <div className="h-4 w-2/3 rounded-md bg-muted" />
        <div className="mt-2 h-3 w-full rounded-md bg-muted" />
        <div className="mt-1 h-3 w-4/5 rounded-md bg-muted" />
        <div className="mt-6 h-px bg-border-subtle" />
        <div className="mt-4 flex items-center justify-between">
          <div className="h-6 w-20 rounded-md bg-muted" />
          <div className="h-8 w-28 rounded-md bg-muted" />
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
  const { openCart } = useUI();
  const { format: formatPrice } = useCurrency();
  const [products, setProducts] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickId, setQuickId] = useState<string | null>(null);
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
    openCart();
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
          <p className="mb-1 text-[11px] font-medium text-primary">
            {t("home.cat.title")}
          </p>
          <h1 className="font-display text-2xl font-medium text-foreground sm:text-[26px]">
            {t("nav.products")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("product.explore_desc")}</p>
        </div>
        {/* Search */}
        <div className="relative shrink-0 sm:w-64">
          <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("search.placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-sm"
          />
        </div>
      </div>

      {/* ── Tab filter + Sort ── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        {/* Tabs */}
        <div className="flex items-center gap-1 rounded-md border border-border bg-muted/70 p-1">
          {tabs.map((tab) => {
            const active = typeFilter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setTypeFilter(tab.value)}
                className={cn("relative flex items-center gap-2 rounded-md px-4 py-1.5 text-[13px] font-medium transition-colors duration-200 ease-out",
                  active ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                <span
                  className={cn("rounded-md px-1.5 py-1 text-[11px] font-medium",
                    active ? "bg-primary-soft text-primary" : "bg-accent text-muted-foreground"
                  )}
                >
                  {tab.count}
                </span>
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
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <MagnifyingGlass className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-[15px] font-medium text-foreground">{t("product.no_products_found")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={handleAddToCart}
              onQuickView={setQuickId}
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
        <div className="mt-10 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {t("filter.showing")}{" "}
            <span className="font-medium text-foreground">{products.length}</span>{" "}
            {t("filter.of")}{" "}
            <span className="font-medium text-foreground">{allProducts.length}</span>{" "}
            {t("nav.products").toLowerCase()}
          </span>
        </div>
      )}

      <QuickView productId={quickId} open={!!quickId} onOpenChange={(v) => { if (!v) setQuickId(null); }} />
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-8 h-8 w-48 animate-pulse rounded-md bg-muted" />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-72 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        </div>
      }
    >
      <ProductsContent />
    </Suspense>
  );
}
