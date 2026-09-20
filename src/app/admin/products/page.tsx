"use client";

import { useEffect, useState, useCallback } from "react";
import { useI18n } from "@/contexts/i18n-context";
import { apiFetch } from "@/lib/client-api";
import { formatMoney } from "@/lib/format";
import { PageHeader, DataTable, FilterBar, ConfirmDialog, type ColumnDef } from "../_components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, PencilSimple, Trash, Upload, Download, Image as ImageIcon, Package, Power, Tag, X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { toast } from "sonner";
import { DeliveryMethodPicker } from "@/components/delivery-method-picker";
import type { ApiProductType } from "@/config/product-types";

// ── Types ──
interface Category { id: string; name: string; name_en: string; type: string; }
interface Product {
  id: string; title: string; title_en: string; title_pt: string; description: string;
  description_en: string; description_pt: string; price: number | string; compare_at_price?: number | string | null; cost_price?: string; attribute_unit?: string;
  category_id: string; type: string; status: string; duration: string | null;
  delivery_method: string | null; meta_title?: string; meta_description?: string; meta_title_pt?: string; meta_description_pt?: string;
  barcode?: string | null; vendor?: string | null; collection?: string | null; tags?: string | null;
  image_key?: string; categories: Category | null;
}
interface ProductFormData {
  title: string; title_en: string; title_pt: string; description: string; description_en: string; description_pt: string;
  price: string; compare_at_price: string; cost_price: string; category_id: string; type: string;
  status: string; duration: string; attribute_unit: string;
  delivery_method: string; barcode: string; vendor: string; collection: string; tags: string;
  meta_title: string; meta_description: string; meta_title_pt: string; meta_description_pt: string; image_key: string;
}

interface ProductImageItem {
  id?: string;
  src: string;
  original_url: string;
  alt: string;
  variant_id: string;
  position: number;
  mirror_status: string;
}
// 字段名与后端 product_variants 表对齐（option1/option2/option3）。
// UI 上仍按"属性 1 / 属性 2 / 属性 3"展示。
interface ProductVariant {
  id?: string;  // 已有 variant id（编辑时保留，供 upsert 使用）
  title: string;
  sku: string;
  barcode: string;
  price: string;
  compare_at_price: string;
  cost: string;
  stock: string;
  weight: string;
  weight_unit: string;
  option1: string;
  option2: string;
  option3: string;
  is_default: boolean;
  image: string;
}

const DEFAULT_FORM: ProductFormData = {
  title: "", title_en: "", title_pt: "", description: "", description_en: "", description_pt: "",
  price: "", compare_at_price: "", cost_price: "", category_id: "", type: "service", status: "active",
  duration: "", attribute_unit: "", delivery_method: "online",
  barcode: "", vendor: "", collection: "", tags: "",
  meta_title: "", meta_description: "", meta_title_pt: "", meta_description_pt: "", image_key: "",
};

const EMPTY_VARIANT: ProductVariant = {
  title: "",
  sku: "",
  barcode: "",
  price: "",
  compare_at_price: "",
  cost: "",
  stock: "0",
  weight: "",
  weight_unit: "kg",
  option1: "",
  option2: "",
  option3: "",
  is_default: false,
  image: "",
};

const EMPTY_PRODUCT_IMAGE: ProductImageItem = {
  src: "",
  original_url: "",
  alt: "",
  variant_id: "",
  position: 1,
  mirror_status: "mirrored",
};

const KEEP_CATEGORY_VALUE = "__keep__";

type BulkTagMode = "add" | "remove" | "replace";
type ProductViewKey = "all" | "active" | "inactive" | "sold" | "needs_media" | "needs_seo" | "missing_cost" | "out_of_stock" | "needs_pt";

type ProductViewCounts = Record<ProductViewKey, number>;

const PRODUCT_VIEWS: Array<{ key: ProductViewKey; label: string; tone?: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active", tone: "text-green-700" },
  { key: "inactive", label: "Draft", tone: "text-gray-600" },
  { key: "sold", label: "Sold", tone: "text-yellow-700" },
  { key: "needs_media", label: "Missing media", tone: "text-red-700" },
  { key: "needs_seo", label: "Missing SEO", tone: "text-amber-700" },
  { key: "needs_pt", label: "Missing PT", tone: "text-orange-700" },
  { key: "missing_cost", label: "No cost", tone: "text-purple-700" },
  { key: "out_of_stock", label: "Out of stock", tone: "text-red-700" },
];

const DEFAULT_VIEW_COUNTS: ProductViewCounts = {
  all: 0,
  active: 0,
  inactive: 0,
  sold: 0,
  needs_media: 0,
  needs_seo: 0,
  needs_pt: 0,
  missing_cost: 0,
  out_of_stock: 0,
};

const typeColors: Record<string, string> = {
  service: "bg-blue-100 text-blue-700",
  virtual: "bg-purple-100 text-purple-700",
  physical: "bg-amber-100 text-amber-700",
};
const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-gray-100 text-gray-700",
  sold: "bg-yellow-100 text-yellow-700",
};

function productReadinessIssues(product: Product) {
  const issues: string[] = [];
  if (!product.image_key) issues.push("Media");
  if (!product.meta_title || !product.meta_description) issues.push("SEO");
  if (!product.title_pt || !product.description_pt) issues.push("PT");
  if (!product.cost_price || Number(product.cost_price) <= 0) issues.push("Cost");
  return issues;
}

interface ProductSelectionControls {
  selectedIds: Set<string>;
  visibleIds: string[];
  onToggleOne: (id: string) => void;
  onToggleVisible: () => void;
}

// ── Columns ──
function buildProductColumns(
  typeLabel: (code: string) => string,
  selection: ProductSelectionControls
): ColumnDef<Product>[] {
  const allVisibleSelected = selection.visibleIds.length > 0
    && selection.visibleIds.every((id) => selection.selectedIds.has(id));

  return [
  {
    id: "select",
    header: (
      <input
        type="checkbox"
        aria-label="Select all products on this page"
        checked={allVisibleSelected}
        disabled={selection.visibleIds.length === 0}
        onChange={selection.onToggleVisible}
        className="h-4 w-4 rounded border-gray-300"
      />
    ),
    className: "w-10",
    accessor: (r) => (
      <input
        type="checkbox"
        aria-label={`Select ${r.title}`}
        checked={selection.selectedIds.has(r.id)}
        onClick={(event) => event.stopPropagation()}
        onChange={() => selection.onToggleOne(r.id)}
        className="h-4 w-4 rounded border-gray-300"
      />
    ),
  },
  {
    header: "Title", accessor: (r) => (
      <div>
        <div className="font-medium text-sm">{r.title}</div>
        {(r.vendor || r.collection || r.barcode) && (
          <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-gray-400">
            {r.vendor && <span>{r.vendor}</span>}
            {r.collection && <span>{r.collection}</span>}
            {r.barcode && <span className="font-mono">{r.barcode}</span>}
          </div>
        )}
      </div>
    ),
  },
  {
    header: "Price", accessor: (r) => (
      <div className="font-mono text-sm">
        <div>${formatMoney(r.price)}</div>
        {r.compare_at_price && Number(r.compare_at_price) > Number(r.price) && (
          <div className="text-[11px] text-gray-400 line-through">${formatMoney(r.compare_at_price)}</div>
        )}
      </div>
    ),
  },
  {
    header: "Margin", accessor: (r) => {
      const price = Number(r.price);
      const cost = Number(r.cost_price);
      if (!r.cost_price || !Number.isFinite(cost) || cost <= 0 || !Number.isFinite(price) || price <= 0) {
        return <span className="text-xs text-gray-400">—</span>;
      }
      const margin = ((price - cost) / price) * 100;
      return (
        <span
          className={`font-mono text-xs ${margin < 0 ? "text-red-600" : margin < 20 ? "text-amber-600" : "text-green-700"}`}
          title={`成本 $${formatMoney(r.cost_price)}`}
        >
          {margin.toFixed(0)}%
        </span>
      );
    },
  },
  {
    header: "Readiness", accessor: (r) => {
      const issues = productReadinessIssues(r);
      if (issues.length === 0) {
        return <Badge className="bg-green-50 text-green-700">Ready</Badge>;
      }
      return (
        <div className="flex flex-wrap gap-1">
          {issues.map((issue) => (
            <Badge key={issue} variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
              {issue}
            </Badge>
          ))}
        </div>
      );
    },
  },
  {
    header: "Category", accessor: (r) => (
      <span className="text-xs text-gray-500">{r.categories?.name || "—"}</span>
    ),
  },
  {
    header: "Type", accessor: (r) => (
      <Badge className={`text-xs font-medium ${typeColors[r.type] || "bg-gray-100"}`}>{typeLabel(r.type)}</Badge>
    ),
  },
  {
    header: "Status", accessor: (r) => (
      <Badge className={`text-xs font-medium ${statusColors[r.status] || "bg-gray-100"}`}>{r.status}</Badge>
    ),
  },
  ];
}

export default function AdminProductsPage() {
  const { t } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productTypes, setProductTypes] = useState<ApiProductType[]>([]);
  const [search, setSearch] = useState("");
  const [productView, setProductView] = useState<ProductViewKey>("all");
  const [viewCounts, setViewCounts] = useState<ProductViewCounts>(DEFAULT_VIEW_COUNTS);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  // Delete state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkCatalogOpen, setBulkCatalogOpen] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState(KEEP_CATEGORY_VALUE);
  const [bulkVendorEnabled, setBulkVendorEnabled] = useState(false);
  const [bulkVendor, setBulkVendor] = useState("");
  const [bulkCollectionEnabled, setBulkCollectionEnabled] = useState(false);
  const [bulkCollection, setBulkCollection] = useState("");
  const [bulkTagMode, setBulkTagMode] = useState<BulkTagMode>("add");
  const [bulkTags, setBulkTags] = useState("");

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormData>(DEFAULT_FORM);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [productImages, setProductImages] = useState<ProductImageItem[]>([]);
  const [hasVariants, setHasVariants] = useState(false);  // 多规格开关
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [variantBulkPrice, setVariantBulkPrice] = useState("");
  const [variantBulkCompareAt, setVariantBulkCompareAt] = useState("");
  const [variantBulkCost, setVariantBulkCost] = useState("");
  const [variantBulkStock, setVariantBulkStock] = useState("");
  const [variantBulkWeight, setVariantBulkWeight] = useState("");
  const [variantBulkWeightUnit, setVariantBulkWeightUnit] = useState("kg");
  const [variantSkuPrefix, setVariantSkuPrefix] = useState("");

  const updateVariantAt = (index: number, patch: Partial<ProductVariant>) => {
    setVariants((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const markDefaultVariant = (index: number) => {
    setVariants((prev) => prev.map((item, i) => ({ ...item, is_default: i === index })));
  };

  const updateProductImageAt = (index: number, patch: Partial<ProductImageItem>) => {
    setProductImages((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const applyVariantBulkValue = (field: keyof ProductVariant, value: string) => {
    setVariants((prev) => prev.map((variant) => ({ ...variant, [field]: value })));
  };

  const generateVariantSkus = () => {
    const prefix = variantSkuPrefix.trim();
    if (!prefix) {
      toast.error("Enter a SKU prefix");
      return;
    }
    setVariants((prev) => prev.map((variant, index) => ({
      ...variant,
      sku: `${prefix}-${String(index + 1).padStart(3, "0")}`,
    })));
  };

  const resetVariantBulkTools = () => {
    setVariantBulkPrice("");
    setVariantBulkCompareAt("");
    setVariantBulkCost("");
    setVariantBulkStock("");
    setVariantBulkWeight("");
    setVariantBulkWeightUnit("kg");
    setVariantSkuPrefix("");
  };

  // ── Image upload ──
  const handleImageUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("文件不能超过 5MB");
      return;
    }
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "products");
      const { getStoredToken } = await import("@/contexts/auth-context");
      const token = getStoredToken() || "";
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = "Bearer " + token;
      const res = await fetch("/api/admin/media/upload", {
        method: "POST",
        credentials: "include",
        headers,
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "上传失败");
      // 返回的 url 用作 image_key，详情页通过它渲染商品图
      setForm((prev) => ({ ...prev, image_key: json.url || json.path || "" }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploadingImage(false);
    }
  };

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (productView !== "all") params.set("view", productView);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await apiFetch(`/api/admin/products?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to load products");
      }
      setProducts(json.data || []);
      setTotal(json.total || json.data?.length || 0);
      setViewCounts({ ...DEFAULT_VIEW_COUNTS, ...(json.viewCounts || {}) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load products");
    } finally { setLoading(false); }
  }, [search, productView, typeFilter, statusFilter, page]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/categories");
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to load categories");
      }
      setCategories(json.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load categories");
    }
  }, []);

  const fetchProductTypes = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/product-types?active=true");
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || "Failed to load product types");
      setProductTypes(json.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load product types");
      setProductTypes([
        { id: "builtin-service", code: "service", label: "咨询服务", label_en: "Service", description: "", sort_order: 1, is_active: true, is_builtin: true },
        { id: "builtin-virtual", code: "virtual", label: "虚拟商品", label_en: "Digital Product", description: "", sort_order: 2, is_active: true, is_builtin: true },
        { id: "builtin-physical", code: "physical", label: "实体商品", label_en: "Physical Product", description: "", sort_order: 3, is_active: true, is_builtin: true },
      ]);
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { fetchCategories(); }, [fetchCategories]);
  useEffect(() => { fetchProductTypes(); }, [fetchProductTypes]);
  useEffect(() => { setSelectedIds(new Set()); }, [search, productView, typeFilter, statusFilter, page]);

  const productTypeOptions = productTypes.length > 0 ? productTypes : [
    { id: "fallback-service", code: "service", label: "咨询服务" },
    { id: "fallback-virtual", code: "virtual", label: "虚拟商品" },
    { id: "fallback-physical", code: "physical", label: "实体商品" },
  ];
  const productTypeLabel = (code: string) =>
    productTypeOptions.find((type) => type.code === code)?.label || code;
  const switchProductView = (view: ProductViewKey) => {
    setProductView(view);
    setStatusFilter("all");
    setPage(1);
  };
  const visibleProductIds = products.map((product) => product.id);
  const selectedCount = selectedIds.size;
  const toggleProductSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleVisibleSelection = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allVisibleSelected = visibleProductIds.length > 0
        && visibleProductIds.every((id) => next.has(id));
      if (allVisibleSelected) {
        visibleProductIds.forEach((id) => next.delete(id));
      } else {
        visibleProductIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const resetBulkCatalogForm = () => {
    setBulkCategoryId(KEEP_CATEGORY_VALUE);
    setBulkVendorEnabled(false);
    setBulkVendor("");
    setBulkCollectionEnabled(false);
    setBulkCollection("");
    setBulkTagMode("add");
    setBulkTags("");
  };
  const productColumns = buildProductColumns(productTypeLabel, {
    selectedIds,
    visibleIds: visibleProductIds,
    onToggleOne: toggleProductSelection,
    onToggleVisible: toggleVisibleSelection,
  });

  // ── 一键上下架 ──
  const toggleStatus = async (p: Product) => {
    const next = p.status === "active" ? "inactive" : "active";
    try {
      const res = await apiFetch(`/api/admin/products/${p.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || "操作失败");
      toast.success(next === "active" ? `「${p.title}」已上架` : `「${p.title}」已下架`);
      fetchProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  };

  // ── Delete ──
  const openDelete = (p: Product) => { setDeleteTarget(p); setDeleteOpen(true); };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/admin/products/${deleteTarget.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to delete product");
      }
      toast.success("Product deleted");
      setDeleteOpen(false);
      setDeleteTarget(null);
      fetchProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete product");
    } finally {
      setDeleting(false);
    }
  };

  const bulkSetStatus = async (status: "active" | "inactive" | "sold") => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await apiFetch("/api/admin/products", {
        method: "PATCH",
        body: JSON.stringify({ action: "set_status", ids, status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        throw new Error(json.error || "Bulk update failed");
      }
      toast.success(`Updated ${ids.length} products`);
      clearSelection();
      fetchProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const saveBulkCatalog = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const fields: Record<string, string | null> = {};
    if (bulkCategoryId !== KEEP_CATEGORY_VALUE) fields.category_id = bulkCategoryId;
    if (bulkVendorEnabled) fields.vendor = bulkVendor;
    if (bulkCollectionEnabled) fields.collection = bulkCollection;
    const tagValues = bulkTags.split(/[,，\n]/).map((tag) => tag.trim()).filter(Boolean);
    const tags = tagValues.length > 0 ? { mode: bulkTagMode, values: tagValues } : undefined;

    if (Object.keys(fields).length === 0 && !tags) {
      toast.error("Choose at least one field to update");
      return;
    }

    setBulkBusy(true);
    try {
      const res = await apiFetch("/api/admin/products", {
        method: "PATCH",
        body: JSON.stringify({ action: "update_catalog", ids, fields, tags }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        throw new Error(json.error || "Bulk edit failed");
      }
      toast.success(`Updated ${ids.length} products`);
      setBulkCatalogOpen(false);
      resetBulkCatalogForm();
      clearSelection();
      fetchProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk edit failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const confirmBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await apiFetch("/api/admin/products", {
        method: "PATCH",
        body: JSON.stringify({ action: "delete", ids }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        throw new Error(json.error || "Bulk delete failed");
      }
      toast.success(`Deleted ${ids.length} products`);
      setBulkDeleteOpen(false);
      clearSelection();
      fetchProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk delete failed");
    } finally {
      setBulkBusy(false);
    }
  };

  // ── Edit / Create ──
  const openEdit = async (p?: Product) => {
    resetVariantBulkTools();
    if (p) {
      setEditTarget(p);
      setForm({
        title: p.title, title_en: p.title_en, title_pt: p.title_pt || "", description: p.description,
        description_en: p.description_en, description_pt: p.description_pt || "", price: String(p.price),
        compare_at_price: p.compare_at_price ? String(p.compare_at_price) : "",
        cost_price: p.cost_price || "", category_id: p.category_id,
        type: p.type, status: p.status, duration: p.duration || "",
        attribute_unit: p.attribute_unit || "", delivery_method: p.delivery_method || "online",
        barcode: p.barcode || "", vendor: p.vendor || "", collection: p.collection || "", tags: p.tags || "",
        meta_title: p.meta_title || "", meta_description: p.meta_description || "",
        meta_title_pt: p.meta_title_pt || "", meta_description_pt: p.meta_description_pt || "",
        image_key: p.image_key || "",
      });
      // 拉已有 variants
      try {
        const res = await apiFetch(`/api/products/${p.id}/variants`);
        const json = await res.json();
        const existing = (json.data || []) as Array<Record<string, unknown>>;
        setVariants(existing.map((v) => ({
          id: v.id ? String(v.id) : undefined,
          title: String(v.title || ""),
          sku: String(v.sku || ""),
          barcode: String(v.barcode || ""),
          price: String(v.price || ""),
          compare_at_price: String(v.compare_at_price || ""),
          cost: String(v.cost || ""),
          stock: String(v.stock ?? "0"),
          weight: String(v.weight || ""),
          weight_unit: String(v.weight_unit || "kg"),
          option1: String(v.option1 || ""),
          option2: String(v.option2 || ""),
          option3: String(v.option3 || ""),
          is_default: Boolean(v.is_default),
          image: String(v.image || ""),
        })));
        setHasVariants(existing.length > 0);
      } catch {
        setVariants([]);
      }
      try {
        const res = await apiFetch(`/api/admin/products/${p.id}/images`);
        const json = await res.json();
        const images = (json.data || []) as Array<Record<string, unknown>>;
        setProductImages(images.map((image, index) => ({
          id: image.id ? String(image.id) : undefined,
          src: String(image.src || ""),
          original_url: String(image.original_url || image.src || ""),
          alt: String(image.alt || ""),
          variant_id: String(image.variant_id || ""),
          position: Number(image.position || index + 1),
          mirror_status: String(image.mirror_status || "mirrored"),
        })));
      } catch {
        setProductImages([]);
      }
    } else {
      setEditTarget(null);
      setForm(DEFAULT_FORM);
      setVariants([]);
      setProductImages([]);
    }
    setEditOpen(true);
  };

  const saveProduct = async () => {
    // 客户端校验：必填字段提示
    if (!form.title.trim()) {
      toast.error("请填写商品标题（Title）");
      return;
    }
    if (!form.category_id) {
      toast.error("请选择商品分类（Category）");
      return;
    }
    if (!form.type) {
      toast.error("请选择商品类型（Type）");
      return;
    }
    // price 在有变体时可为空（后端自动取最低价）
    if (!form.price && variants.length === 0) {
      toast.error("请填写价格（Price）或添加规格变体");
      return;
    }

    setSaving(true);
    try {
      const body = { ...form, variants };
      const res = await apiFetch(
        editTarget ? `/api/admin/products/${editTarget.id}` : "/api/admin/products",
        { method: editTarget ? "PUT" : "POST", body: JSON.stringify(body) }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to save product");
      }
      const productId = editTarget?.id || json.data?.id;
      if (productId) {
        const normalizedImages = productImages
          .filter((image) => image.src.trim())
          .map((image, index) => ({
            ...image,
            original_url: image.original_url || image.src,
            position: index + 1,
          }));
        const imageRes = await apiFetch(`/api/admin/products/${productId}/images`, {
          method: "PUT",
          body: JSON.stringify({ images: normalizedImages }),
        });
        const imageJson = await imageRes.json().catch(() => ({}));
        if (!imageRes.ok || imageJson.error) {
          throw new Error(imageJson.error || "Failed to save product images");
        }
      }
      toast.success(editTarget ? "Product updated" : "Product created");
      setEditOpen(false);
      fetchProducts();
    } catch (err) {
      console.error("[saveProduct] 保存失败:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save product");
    } finally { setSaving(false); }
  };

  return (
    <>
      <PageHeader
        title={t("admin.products")}
        description={t("admin.manage_products") || "Manage your product catalog"}
        actions={
          <div className="flex items-center gap-2">
            {categories.length === 0 && (
              <span className="text-xs text-red-500">请先创建分类</span>
            )}
            <Button size="sm" onClick={() => openEdit()} disabled={categories.length === 0}>
              <Plus className="h-4 w-4 mr-1.5" /> New Product
            </Button>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {PRODUCT_VIEWS.map((view) => {
          const active = productView === view.key;
          const count = viewCounts[view.key] ?? 0;
          return (
            <Button
              key={view.key}
              type="button"
              variant={active ? "default" : "outline"}
              size="sm"
              onClick={() => switchProductView(view.key)}
              className={active ? "" : view.tone}
            >
              {view.label}
              <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[11px] ${active ? "bg-white/20 text-current" : "bg-gray-100 text-gray-600"}`}>
                {count}
              </span>
            </Button>
          );
        })}
      </div>

      <FilterBar
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search products..."
        filters={[
          {
            key: "type", label: "Type", value: typeFilter,
            options: [
              { label: "All Types", value: "all" },
              ...productTypeOptions.map((type) => ({ label: type.label, value: type.code })),
            ],
            onChange: (v) => { setTypeFilter(v); setPage(1); },
          },
          {
            key: "status", label: "Status", value: statusFilter,
            options: [
              { label: "All Statuses", value: "all" },
              { label: "Active", value: "active" },
              { label: "Inactive", value: "inactive" },
              { label: "Sold", value: "sold" },
            ],
            onChange: (v) => { setStatusFilter(v); setPage(1); },
          },
        ]}
        actions={
          <div className="flex gap-2">
            <Link href="/admin/products/import">
              <Button variant="outline" size="sm"><Upload className="h-3.5 w-3.5 mr-1" />Import</Button>
            </Link>
            <Link href="/admin/products/export">
              <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 mr-1" />Export</Button>
            </Link>
          </div>
        }
      />

      {selectedCount > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
          <div className="text-sm text-blue-900">
            Selected <span className="font-semibold">{selectedCount}</span> products
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={bulkBusy} onClick={() => bulkSetStatus("active")}>
              <Power className="h-3.5 w-3.5 text-green-600" /> Publish
            </Button>
            <Button variant="outline" size="sm" disabled={bulkBusy} onClick={() => bulkSetStatus("inactive")}>
              <Power className="h-3.5 w-3.5 text-gray-500" /> Unpublish
            </Button>
            <Button variant="outline" size="sm" disabled={bulkBusy} onClick={() => bulkSetStatus("sold")}>
              <Tag className="h-3.5 w-3.5 text-yellow-600" /> Mark sold
            </Button>
            <Button variant="outline" size="sm" disabled={bulkBusy} onClick={() => setBulkCatalogOpen(true)}>
              <PencilSimple className="h-3.5 w-3.5" /> Bulk edit
            </Button>
            <Button variant="ghost" size="sm" disabled={bulkBusy} onClick={clearSelection}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
            <Button variant="destructive" size="sm" disabled={bulkBusy} onClick={() => setBulkDeleteOpen(true)}>
              <Trash className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        </div>
      )}

      <DataTable
        data={products}
        columns={productColumns}
        keyExtractor={(r) => r.id}
        loading={loading}
        pagination={{ page, pageSize, total, onPageChange: setPage }}
        rowActions={(row) => (
          <>
            <Button
              variant="ghost" size="sm" className="h-8 w-8 p-0"
              title={row.status === "active" ? "下架" : "上架"}
              onClick={() => toggleStatus(row)}
            >
              <Power className={`h-3.5 w-3.5 ${row.status === "active" ? "text-green-600" : "text-gray-400"}`} />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(row)}>
              <PencilSimple className="h-3.5 w-3.5 text-gray-500" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openDelete(row)}>
              <Trash className="h-3.5 w-3.5 text-red-500" />
            </Button>
          </>
        )}
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Product"
        message={`Are you sure you want to delete "${deleteTarget?.title}"? This cannot be undone.`}
        onConfirm={confirmDelete}
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        variant="danger"
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title="Delete Selected Products"
        message={`Delete ${selectedCount} selected products? This cannot be undone.`}
        onConfirm={confirmBulkDelete}
        confirmLabel={bulkBusy ? "Deleting..." : "Delete selected"}
        variant="danger"
      />

      <Dialog
        open={bulkCatalogOpen}
        onOpenChange={(open) => {
          if (bulkBusy) return;
          setBulkCatalogOpen(open);
          if (!open) resetBulkCatalogForm();
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Bulk Edit Products</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-600">
              Apply changes to <span className="font-semibold text-gray-900">{selectedCount}</span> selected products.
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={bulkCategoryId} onValueChange={setBulkCategoryId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP_CATEGORY_VALUE}>Keep existing category</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-2 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={bulkVendorEnabled}
                    onChange={(event) => setBulkVendorEnabled(event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm font-medium">Update vendor</span>
                </div>
                <Input
                  value={bulkVendor}
                  onChange={(event) => setBulkVendor(event.target.value)}
                  disabled={!bulkVendorEnabled}
                  placeholder="Empty clears vendor"
                />
              </label>

              <label className="space-y-2 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={bulkCollectionEnabled}
                    onChange={(event) => setBulkCollectionEnabled(event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm font-medium">Update collection</span>
                </div>
                <Input
                  value={bulkCollection}
                  onChange={(event) => setBulkCollection(event.target.value)}
                  disabled={!bulkCollectionEnabled}
                  placeholder="Empty clears collection"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[150px_1fr]">
              <div className="space-y-2">
                <Label>Tags</Label>
                <Select value={bulkTagMode} onValueChange={(value) => setBulkTagMode(value as BulkTagMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">Add tags</SelectItem>
                    <SelectItem value="remove">Remove tags</SelectItem>
                    <SelectItem value="replace">Replace tags</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-transparent">Tag values</Label>
                <Textarea
                  value={bulkTags}
                  onChange={(event) => setBulkTags(event.target.value)}
                  placeholder="summer-sale, featured, B2B"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">Separate tags with commas or new lines. Leave empty to keep tags unchanged.</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkCatalogOpen(false)} disabled={bulkBusy}>Cancel</Button>
            <Button onClick={saveBulkCatalog} disabled={bulkBusy}>
              {bulkBusy ? "Saving..." : "Apply changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!saving) { setEditOpen(o); if (!o) setSaving(false); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Product" : "New Product"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            {/* Basic fields */}
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Title (EN)</Label>
              <Input value={form.title_en} onChange={(e) => setForm({ ...form, title_en: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Description (EN)</Label>
              <Textarea value={form.description_en} onChange={(e) => setForm({ ...form, description_en: e.target.value })} rows={3} />
            </div>

            {/* Portuguese Content */}
            <div className="col-span-2 mt-2 mb-1">
              <h3 className="text-sm font-semibold text-gray-700 border-b pb-1">🇵🇹 Conteúdo em Português</h3>
            </div>
            <div className="space-y-2">
              <Label>Title (PT)</Label>
              <Input value={form.title_pt} onChange={(e) => setForm({ ...form, title_pt: e.target.value })} placeholder="Título em português" />
            </div>
            <div className="space-y-2">
              <Label>Meta Title (PT)</Label>
              <Input value={form.meta_title_pt} onChange={(e) => setForm({ ...form, meta_title_pt: e.target.value })} placeholder="Meta título em português" />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Description (PT)</Label>
              <Textarea value={form.description_pt} onChange={(e) => setForm({ ...form, description_pt: e.target.value })} rows={3} placeholder="Descrição em português" />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Meta Description (PT)</Label>
              <Textarea value={form.meta_description_pt} onChange={(e) => setForm({ ...form, meta_description_pt: e.target.value })} rows={2} placeholder="Meta descrição em português" />
            </div>
            <div className="space-y-2">
              <Label>Price *</Label>
              {hasVariants ? (
                <>
                  <Input type="text" value={variants.length > 0 ? "自动取最低规格价" : form.price} disabled className="text-gray-400" />
                  <p className="text-xs text-muted-foreground">启用多规格后，价格由规格变体决定，此处自动展示最低价</p>
                </>
              ) : (
                <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              )}
            </div>
            <div className="space-y-2">
              <Label>Cost Price</Label>
              <Input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Compare-at Price</Label>
              <Input type="number" step="0.01" value={form.compare_at_price} onChange={(e) => setForm({ ...form, compare_at_price: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })} disabled={categories.length === 0}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.length === 0 ? (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center space-y-2">
                      <p>尚未创建任何分类</p>
                      <Link href="/admin/categories" className="text-blue-600 underline text-xs">前往分类管理 →</Link>
                    </div>
                  ) : (
                    categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {productTypeOptions.map((type) => (
                    <SelectItem key={type.code} value={type.code}>
                      {productTypeLabel(type.code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Duration</Label>
              <Input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="e.g. 30min" />
            </div>
            <div className="space-y-2">
              <Label>Delivery Method</Label>
              <DeliveryMethodPicker
                value={form.delivery_method}
                productType={form.type}
                onChange={(v) => setForm({ ...form, delivery_method: v })}
              />
            </div>
            <div className="space-y-2">
              <Label>Attribute Unit</Label>
              <Input value={form.attribute_unit} onChange={(e) => setForm({ ...form, attribute_unit: e.target.value })} placeholder="e.g. per user" />
            </div>
            <div className="space-y-2">
              <Label>Barcode</Label>
              <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Vendor</Label>
              <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Collection</Label>
              <Input value={form.collection} onChange={(e) => setForm({ ...form, collection: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Tags</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>SEO Title</Label>
              <Input value={form.meta_title} onChange={(e) => setForm({ ...form, meta_title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>SEO Description</Label>
              <Input value={form.meta_description} onChange={(e) => setForm({ ...form, meta_description: e.target.value })} />
            </div>

            {/* Variants editor */}
            <div className="col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Label>规格 (variants)</Label>
                  {/* 多规格开关 */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hasVariants}
                      onChange={(e) => {
                        setHasVariants(e.target.checked);
                        if (!e.target.checked) {
                          setVariants([]);
                          // 关闭多规格时清空价格让用户重新输入，或保留原价
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-muted-foreground">启用多规格</span>
                  </label>
                </div>
                {hasVariants && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setVariants((prev) => [
                        ...prev,
                        { ...EMPTY_VARIANT, price: form.price || "0", is_default: prev.length === 0 },
                      ])
                    }
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> 新增规格
                  </Button>
                )}
              </div>
              {!hasVariants ? (
                <p className="text-xs text-muted-foreground">未启用多规格。如需不同版本/属性定价，请开启上方开关。</p>
              ) : variants.length === 0 ? (
                <p className="text-xs text-muted-foreground">已启用多规格，请点击“新增规格”添加变体（每条规格独立的价格、库存、属性）。</p>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-md border bg-white p-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">Variant bulk tools</div>
                        <p className="text-xs text-muted-foreground">Apply shared values to all variants, then adjust individual rows.</p>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={resetVariantBulkTools}>
                        <X className="h-3.5 w-3.5" /> Clear tools
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="flex gap-1">
                        <Input type="number" step="0.01" placeholder="Price" value={variantBulkPrice} onChange={(e) => setVariantBulkPrice(e.target.value)} />
                        <Button type="button" variant="outline" size="sm" disabled={!variantBulkPrice} onClick={() => applyVariantBulkValue("price", variantBulkPrice)}>Apply</Button>
                      </div>
                      <div className="flex gap-1">
                        <Input type="number" step="0.01" placeholder="Compare-at" value={variantBulkCompareAt} onChange={(e) => setVariantBulkCompareAt(e.target.value)} />
                        <Button type="button" variant="outline" size="sm" onClick={() => applyVariantBulkValue("compare_at_price", variantBulkCompareAt)}>Apply</Button>
                      </div>
                      <div className="flex gap-1">
                        <Input type="number" step="0.01" placeholder="Cost" value={variantBulkCost} onChange={(e) => setVariantBulkCost(e.target.value)} />
                        <Button type="button" variant="outline" size="sm" onClick={() => applyVariantBulkValue("cost", variantBulkCost)}>Apply</Button>
                      </div>
                      <div className="flex gap-1">
                        <Input type="number" min="0" placeholder="Stock" value={variantBulkStock} onChange={(e) => setVariantBulkStock(e.target.value)} />
                        <Button type="button" variant="outline" size="sm" disabled={!variantBulkStock} onClick={() => applyVariantBulkValue("stock", variantBulkStock)}>Apply</Button>
                      </div>
                      <div className="flex gap-1">
                        <Input type="number" step="0.01" placeholder="Weight" value={variantBulkWeight} onChange={(e) => setVariantBulkWeight(e.target.value)} />
                        <Button type="button" variant="outline" size="sm" onClick={() => {
                          applyVariantBulkValue("weight", variantBulkWeight);
                          applyVariantBulkValue("weight_unit", variantBulkWeightUnit);
                        }}>Apply</Button>
                      </div>
                      <Input placeholder="Weight unit" value={variantBulkWeightUnit} onChange={(e) => setVariantBulkWeightUnit(e.target.value)} />
                      <div className="flex gap-1 sm:col-span-2">
                        <Input placeholder="SKU prefix, e.g. SHIRT-BLACK" value={variantSkuPrefix} onChange={(e) => setVariantSkuPrefix(e.target.value)} />
                        <Button type="button" variant="outline" size="sm" onClick={generateVariantSkus}>Generate SKUs</Button>
                      </div>
                    </div>
                  </div>
                  {variants.map((v, i) => (
                    <div key={i} className="rounded-md border bg-gray-50/40 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">规格 #{i + 1}</span>
                        {editTarget?.id && v.id ? (
                          <Link className="ml-auto" href={`/admin/inventory?product_id=${encodeURIComponent(editTarget.id)}&variant_id=${encodeURIComponent(v.id)}&action=adjust`}>
                            <Button type="button" variant="outline" size="sm" className="h-7 px-2">
                              <Package className="h-3.5 w-3.5 mr-1" /> Stock
                            </Button>
                          </Link>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-red-500"
                          onClick={() => setVariants(variants.filter((_, idx) => idx !== i))}
                        >
                          <Trash className="h-3.5 w-3.5 mr-1" /> 删除
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">标题</Label>
                          <Input value={v.title} onChange={(e) => {
                            const next = [...variants]; next[i] = { ...v, title: e.target.value }; setVariants(next);
                          }} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">SKU</Label>
                          <Input value={v.sku} onChange={(e) => {
                            const next = [...variants]; next[i] = { ...v, sku: e.target.value }; setVariants(next);
                          }} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">价格</Label>
                          <Input type="number" step="0.01" value={v.price} onChange={(e) => {
                            const next = [...variants]; next[i] = { ...v, price: e.target.value }; setVariants(next);
                          }} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">库存</Label>
                          <Input type="number" value={v.stock} onChange={(e) => {
                            const next = [...variants]; next[i] = { ...v, stock: e.target.value }; setVariants(next);
                          }} />
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <Input placeholder="属性 1 (如 颜色: 红)" value={v.option1} onChange={(e) => {
                          const next = [...variants]; next[i] = { ...v, option1: e.target.value }; setVariants(next);
                        }} />
                        <Input placeholder="属性 2 (如 尺寸: L)" value={v.option2} onChange={(e) => {
                          const next = [...variants]; next[i] = { ...v, option2: e.target.value }; setVariants(next);
                        }} />
                        <Input placeholder="属性 3" value={v.option3} onChange={(e) => {
                          const next = [...variants]; next[i] = { ...v, option3: e.target.value }; setVariants(next);
                        }} />
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <Input placeholder="Barcode" value={v.barcode} onChange={(e) => updateVariantAt(i, { barcode: e.target.value })} />
                        <Input type="number" step="0.01" placeholder="Compare-at price" value={v.compare_at_price} onChange={(e) => updateVariantAt(i, { compare_at_price: e.target.value })} />
                        <Input type="number" step="0.01" placeholder="Cost" value={v.cost} onChange={(e) => updateVariantAt(i, { cost: e.target.value })} />
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_90px_160px]">
                        <Input type="number" step="0.01" placeholder="Weight" value={v.weight} onChange={(e) => updateVariantAt(i, { weight: e.target.value })} />
                        <Input placeholder="kg" value={v.weight_unit} onChange={(e) => updateVariantAt(i, { weight_unit: e.target.value })} />
                        <label className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-xs text-muted-foreground">
                          <input
                            type="radio"
                            name="default-variant"
                            checked={v.is_default}
                            onChange={() => markDefaultVariant(i)}
                          />
                          Default variant
                        </label>
                      </div>
                      <Input className="mt-2" placeholder="Variant image URL" value={v.image} onChange={(e) => updateVariantAt(i, { image: e.target.value })} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Image upload */}
            <div className="col-span-2 space-y-2">
              <Label>商品图片</Label>
              <div className="flex items-center gap-3">
                {form.image_key ? (
                  <div className="relative h-20 w-20 overflow-hidden rounded-md border bg-gray-50">
                    {/* 用 background-image 避免 next/image 在 admin 内可能的 domain 配置问题 */}
                    <div
                      className="h-full w-full bg-contain bg-center bg-no-repeat"
                      style={{ backgroundImage: `url(${form.image_key})` }}
                    />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, image_key: "" })}
                      className="absolute right-0 top-0 rounded-bl bg-black/60 px-1 text-xs text-white"
                      aria-label="Remove image"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed bg-gray-50 text-gray-400">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
                <label className="flex-1 cursor-pointer">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageUpload(f);
                      e.target.value = "";
                    }}
                  />
                  <span className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50">
                    <Upload className="h-4 w-4" />
                    {uploadingImage ? "上传中..." : form.image_key ? "替换图片" : "上传图片"}
                  </span>
                  <p className="mt-1 text-xs text-muted-foreground">JPG / PNG / WebP / GIF · ≤ 5MB</p>
                </label>
              </div>
            </div>

            <div className="col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <Label>商品图库</Label>
                <div className="flex gap-2">
                  {form.image_key && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setProductImages((prev) => [
                        ...prev,
                        { ...EMPTY_PRODUCT_IMAGE, src: form.image_key, original_url: form.image_key, position: prev.length + 1 },
                      ])}
                    >
                      使用主图
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setProductImages((prev) => [
                      ...prev,
                      { ...EMPTY_PRODUCT_IMAGE, position: prev.length + 1 },
                    ])}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> 添加图片
                  </Button>
                </div>
              </div>
              {productImages.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无详情图。导入的 Shopify 图片会显示在这里，也可以手动添加图片 URL。</p>
              ) : (
                <div className="space-y-2">
                  {productImages.map((image, index) => (
                    <div key={image.id || index} className="grid grid-cols-1 gap-2 rounded-md border bg-gray-50/50 p-3 sm:grid-cols-[72px_1fr_160px_80px]">
                      <div className="h-16 w-16 overflow-hidden rounded border bg-white">
                        {image.src ? (
                          <div className="h-full w-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${image.src})` }} />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-gray-300">
                            <ImageIcon className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Input placeholder="Image URL" value={image.src} onChange={(e) => updateProductImageAt(index, { src: e.target.value, original_url: image.original_url || e.target.value })} />
                        <Input placeholder="Alt text" value={image.alt} onChange={(e) => updateProductImageAt(index, { alt: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <select
                          className="h-9 w-full rounded-md border bg-white px-2 text-sm"
                          value={image.variant_id}
                          onChange={(e) => updateProductImageAt(index, { variant_id: e.target.value })}
                        >
                          <option value="">所有变体</option>
                          {variants.filter((variant) => variant.id).map((variant, variantIndex) => (
                            <option key={variant.id} value={variant.id}>
                              {variant.title || variant.sku || `Variant ${variantIndex + 1}`}
                            </option>
                          ))}
                        </select>
                        <div className="rounded-md border bg-white px-2 py-2 text-xs text-muted-foreground">
                          {image.mirror_status || "mirrored"}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-500"
                        onClick={() => setProductImages((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={saveProduct} disabled={saving}>
              {saving ? "Saving..." : (editTarget ? "Update" : "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
