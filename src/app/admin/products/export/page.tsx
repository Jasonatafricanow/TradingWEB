"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "../../_components";
import { Download, Spinner } from "@phosphor-icons/react";

interface Category {
  id: string;
  name: string;
  name_en: string;
}

export default function AdminProductsExportPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const { apiFetch } = await import("@/lib/client-api");
        const res = await apiFetch("/api/admin/categories");
        if (res.ok) {
          const data = await res.json();
          setCategories(data.data || []);
        }
      } catch {
        // silently fail
      }
    };
    fetchCategories();
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const queryString = params.toString();
      const url = "/api/admin/products/export" + (queryString ? "?" + queryString : "");

      const { getStoredToken } = await import("@/contexts/auth-context");
      const token = getStoredToken() || "";
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = "Bearer " + token;
      const res = await fetch(url, {
        credentials: "include",
        headers,
      });

      if (!res.ok) {
        alert("Export failed");
        return;
      }

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      const timestamp = new Date().toISOString().slice(0, 10);
      a.download = "products-export-" + timestamp + ".csv";
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch {
      alert("Export failed due to network error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">导出产品</h1>
            <p className="mt-1 text-sm text-muted-foreground">将产品数据导出为 CSV 文件</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">导出选项</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>按分类筛选（可选）</Label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="所有分类" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">所有分类</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name} / {cat.name_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>按状态筛选（可选）</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="所有状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">所有状态</SelectItem>
                    <SelectItem value="active">上架 (Active)</SelectItem>
                    <SelectItem value="inactive">下架 (Inactive)</SelectItem>
                    <SelectItem value="sold">已售罄 (Sold)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleExport} disabled={exporting} className="gap-2 w-full sm:w-auto">
                {exporting ? (
                  <>
                    <Spinner className="h-4 w-4" />
                    导出中...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    导出产品
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>);
}
