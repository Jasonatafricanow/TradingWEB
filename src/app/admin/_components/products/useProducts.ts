"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/client-api";
import { toast } from "sonner";

export interface Product {
  id: string;
  title: string;
  title_en: string;
  description: string;
  description_en: string;
  price: number;
  cost_price?: string;
  attribute_unit?: string;
  category_id: string;
  type: string;
  status: string;
  duration: string | null;
  delivery_method: string | null;
  meta_title?: string;
  meta_description?: string;
  image_key?: string;
  categories: { id: string; name: string; name_en: string; type: string } | null;
}

export interface ProductFormData {
  title: string;
  title_en: string;
  description: string;
  description_en: string;
  price: string;
  cost_price: string;
  category_id: string;
  type: string;
  status: string;
  duration: string;
  attribute_unit: string;
  delivery_method: string;
  meta_title: string;
  meta_description: string;
  image_key: string;
}

const DEFAULT_FORM: ProductFormData = {
  title: "", title_en: "", description: "", description_en: "",
  price: "", cost_price: "", category_id: "", type: "service", status: "active",
  duration: "", attribute_unit: "", delivery_method: "online",
  meta_title: "", meta_description: "", image_key: "",
};

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await apiFetch(`/api/admin/products?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to load products");
      }
      setProducts(json.data || []);
      setTotal(json.total || json.data?.length || 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter, page]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const refresh = () => fetchProducts();

  return {
    products, loading, total, page, setPage, pageSize,
    search, setSearch, statusFilter, setStatusFilter,
    typeFilter, setTypeFilter, refresh,
    DEFAULT_FORM,
  };
}
