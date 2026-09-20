"use client";

import { useEffect, useState, useCallback } from "react";
import { useI18n } from "@/contexts/i18n-context";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton"
import { getErrorMessage } from "@/lib/error-message";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import type { ApiProductType } from "@/config/product-types";

interface Category {
  id: string;
  name: string;
  name_en: string;
  name_ja: string;
  name_es: string;
  type: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

interface CategoryFormData {
  name: string;
  name_en: string;
  name_ja: string;
  name_es: string;
  type: string;
  icon: string;
  sort_order: string;
  is_active: boolean;
}

const emptyForm: CategoryFormData = {
  name: "",
  name_en: "",
  name_ja: "",
  name_es: "",
  type: "service",
  icon: "",
  sort_order: "0",
  is_active: true,
};

export default function AdminCategoriesPage() {
  const { t } = useI18n();
  const [categories, setCategories] = useState<Category[]>([]);
  const [productTypes, setProductTypes] = useState<ApiProductType[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState<CategoryFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const { apiFetch } = await import("@/lib/client-api");
      const res = await apiFetch("/api/admin/categories");
      if (res.ok) {
        const data = await res.json();
        setCategories(data.data || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProductTypes = useCallback(async () => {
    try {
      const { apiFetch } = await import("@/lib/client-api");
      const res = await apiFetch("/api/admin/product-types?active=true");
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || "Failed to load product types");
      setProductTypes(json.data || []);
    } catch {
      setProductTypes([
        { id: "builtin-service", code: "service", label: "咨询服务", label_en: "Service", description: "", sort_order: 1, is_active: true, is_builtin: true },
        { id: "builtin-virtual", code: "virtual", label: "虚拟商品", label_en: "Digital Product", description: "", sort_order: 2, is_active: true, is_builtin: true },
        { id: "builtin-physical", code: "physical", label: "实体商品", label_en: "Physical Product", description: "", sort_order: 3, is_active: true, is_builtin: true },
      ]);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);
  useEffect(() => {
    fetchProductTypes();
  }, [fetchProductTypes]);

  const openAddDialog = () => {
    setEditingCategory(null);
    setFormData(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (cat: Category) => {
    setEditingCategory(cat);
    setFormData({
      name: cat.name,
      name_en: cat.name_en || "",
      name_ja: cat.name_ja || "",
      name_es: cat.name_es || "",
      type: cat.type,
      icon: cat.icon || "",
      sort_order: String(cat.sort_order),
      is_active: cat.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = editingCategory
        ? `/api/admin/categories/${editingCategory.id}`
        : "/api/admin/categories";
      const method = editingCategory ? "PUT" : "POST";

      const { apiFetch } = await import("@/lib/client-api");
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setDialogOpen(false);
        fetchCategories();
      } else {
        const data = await res.json();
        alert(getErrorMessage(data.error, "Save failed"));
      }
    } catch {
      alert("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { apiFetch } = await import("@/lib/client-api");
      const res = await apiFetch(`/api/admin/categories/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeleteTarget(null);
        fetchCategories();
      } else {
        const json = await res.json().catch(() => ({}));
        toast.error(getErrorMessage(json.error, "Delete failed"));
        setDeleteTarget(null); // 失败也关闭弹窗，避免卡死
      }
    } catch {
      toast.error("Delete failed");
      setDeleteTarget(null); // 失败也关闭弹窗
    } finally {
      setDeleting(false);
    }
  };

  const typeLabel = (type: string) => {
    const translated = t(`product.type.${type}`);
    return productTypes.find((item) => item.code === type)?.label || (translated === `product.type.${type}` ? type : translated);
  };

  if (loading) {
    return (
      <div className="flex"><div className="flex-1 p-8 space-y-4">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-8 w-48" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  
  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t("admin.category_list")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {categories.length} {t("admin.categories")}
              </p>
            </div>
            <Button onClick={openAddDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              {t("admin.add_category")}
            </Button>
          </div>

          {/* Categories Grid */}
          {loading ? (
            <div className="mt-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((cat) => (
                <Card key={cat.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{cat.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {typeLabel(cat.type)}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {cat.name_en} / {cat.name_ja} / {cat.name_es}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{t("admin.category_sort")}: {cat.sort_order}</span>
                          <span>•</span>
                          <span>{cat.is_active ? t("admin.active") : t("admin.inactive")}</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditDialog(cat)}
                        >
                          <PencilSimple className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-600"
                          onClick={() => setDeleteTarget(cat)}
                        >
                          <Trash className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Add/Edit Dialog */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingCategory ? t("admin.edit_category") : t("admin.add_category")}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {/* Type */}
                <div className="space-y-2">
                  <Label>{t("admin.category_type")}</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(val) => setFormData((f) => ({ ...f, type: val }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(productTypes.length > 0 ? productTypes : [
                        { code: "service", label: t("product.type.service") },
                        { code: "virtual", label: t("product.type.virtual") },
                        { code: "physical", label: "实体商品" },
                      ]).map((type) => (
                        <SelectItem key={type.code} value={type.code}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Names */}
                <div className="space-y-2">
                  <Label>{t("admin.category_name")} (中文)</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>English</Label>
                    <Input
                      value={formData.name_en}
                      onChange={(e) => setFormData((f) => ({ ...f, name_en: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>日本語</Label>
                    <Input
                      value={formData.name_ja}
                      onChange={(e) => setFormData((f) => ({ ...f, name_ja: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Español</Label>
                    <Input
                      value={formData.name_es}
                      onChange={(e) => setFormData((f) => ({ ...f, name_es: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Sort order & Icon */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("admin.category_sort")}</Label>
                    <Input
                      type="number"
                      value={formData.sort_order}
                      onChange={(e) => setFormData((f) => ({ ...f, sort_order: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Icon (Lucide name)</Label>
                    <Input
                      placeholder="e.g. Briefcase"
                      value={formData.icon}
                      onChange={(e) => setFormData((f) => ({ ...f, icon: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  {t("admin.cancel")}
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "..." : t("admin.save")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation */}
          <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("admin.confirm_delete")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("admin.delete_warning")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {deleting ? "..." : t("admin.delete_product")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>);
}
