"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client-api";
import { PageHeader, DataTable, type ColumnDef } from "../_components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PencilSimple, Plus, Trash } from "@phosphor-icons/react";

interface ProductType {
  id: string;
  code: string;
  label: string;
  label_en: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  is_builtin: boolean;
  product_count?: number;
  category_count?: number;
}

const EMPTY_FORM = {
  code: "",
  label: "",
  label_en: "",
  description: "",
  sort_order: "0",
  is_active: true,
};

type FormState = typeof EMPTY_FORM;

const columns: ColumnDef<ProductType>[] = [
  {
    header: "Code",
    accessor: (row) => <span className="font-mono text-sm">{row.code}</span>,
  },
  {
    header: "名称",
    accessor: (row) => (
      <div>
        <div className="font-medium">{row.label}</div>
        {row.label_en ? <div className="text-xs text-gray-400">{row.label_en}</div> : null}
      </div>
    ),
  },
  {
    header: "说明",
    accessor: (row) => <span className="text-sm text-gray-500">{row.description || "—"}</span>,
  },
  {
    header: "引用",
    accessor: (row) => (
      <div className="text-xs text-gray-500">
        <div>商品 {row.product_count ?? 0}</div>
        <div>分类 {row.category_count ?? 0}</div>
      </div>
    ),
  },
  {
    header: "状态",
    accessor: (row) => (
      <div className="flex flex-wrap gap-1">
        <Badge className={row.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
          {row.is_active ? "启用" : "禁用"}
        </Badge>
        {row.is_builtin ? <Badge variant="outline">内置</Badge> : null}
      </div>
    ),
  },
  {
    header: "排序",
    accessor: (row) => <span className="text-xs text-gray-400">{row.sort_order}</span>,
  },
];

export default function AdminProductTypesPage() {
  const [types, setTypes] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductType | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/product-types");
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || "加载商品类型失败");
      setTypes(json.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载商品类型失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (row: ProductType) => {
    setEditTarget(row);
    setForm({
      code: row.code,
      label: row.label,
      label_en: row.label_en || "",
      description: row.description || "",
      sort_order: String(row.sort_order),
      is_active: row.is_active,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.label.trim()) {
      toast.error("请填写类型名称");
      return;
    }
    if (!editTarget && !form.code.trim()) {
      toast.error("请填写 code");
      return;
    }

    setSaving(true);
    try {
      const body = {
        label: form.label.trim(),
        label_en: form.label_en.trim() || undefined,
        description: form.description.trim() || undefined,
        sort_order: Number.parseInt(form.sort_order, 10) || 0,
        is_active: form.is_active,
      };
      const res = await apiFetch(
        editTarget ? `/api/admin/product-types/${editTarget.id}` : "/api/admin/product-types",
        {
          method: editTarget ? "PUT" : "POST",
          body: JSON.stringify(editTarget ? body : { ...body, code: form.code.trim().toLowerCase() }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || "保存失败");
      toast.success(editTarget ? "商品类型已更新" : "商品类型已创建");
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: ProductType) => {
    try {
      const res = await apiFetch(`/api/admin/product-types/${row.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !row.is_active }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || "切换状态失败");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "切换状态失败");
    }
  };

  const deleteType = async (row: ProductType) => {
    if (row.is_builtin) {
      toast.error("内置商品类型不能删除");
      return;
    }
    if (!window.confirm(`确认删除商品类型 "${row.label}"？`)) return;
    try {
      const res = await apiFetch(`/api/admin/product-types/${row.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || "删除失败");
      toast.success("商品类型已删除");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  return (
    <>
      <PageHeader
        title="商品类型"
        description="统一管理 service / virtual / physical 等商品类型。被商品或分类引用的类型不能禁用或删除。"
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            新增类型
          </Button>
        }
      />

      <DataTable
        data={types}
        columns={columns}
        keyExtractor={(row) => row.id}
        loading={loading}
        rowActions={(row) => (
          <>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(row)}>
              <PencilSimple className="h-3.5 w-3.5 text-gray-500" />
            </Button>
            <Switch checked={row.is_active} onCheckedChange={() => toggleActive(row)} className="ml-1" />
            {!row.is_builtin && (
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => deleteType(row)}>
                <Trash className="h-3.5 w-3.5 text-red-500" />
              </Button>
            )}
          </>
        )}
      />

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!saving) setDialogOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? "编辑商品类型" : "新增商品类型"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Code {!editTarget && "*"}</Label>
              <Input
                value={form.code}
                onChange={(event) =>
                  setForm({ ...form, code: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })
                }
                disabled={!!editTarget}
                placeholder="physical"
              />
              {!editTarget && (
                <p className="text-xs text-gray-400">
                  小写字母开头，只含小写字母、数字、下划线或短横线。
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>中文名称 *</Label>
              <Input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>英文名称</Label>
              <Input value={form.label_en} onChange={(event) => setForm({ ...form, label_en: event.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>说明</Label>
              <Textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>排序</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(event) => setForm({ ...form, sort_order: event.target.value })}
                />
              </div>
              <div className="flex items-end justify-between rounded-lg border px-3 py-2">
                <div>
                  <Label>启用</Label>
                  <p className="text-xs text-gray-400">禁用后不在新建商品中显示</p>
                </div>
                <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={save} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
