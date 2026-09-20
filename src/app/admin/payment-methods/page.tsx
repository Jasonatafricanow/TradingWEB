"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/contexts/i18n-context";
import { apiFetch } from "@/lib/client-api";
import { PageHeader, DataTable, type ColumnDef } from "../_components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, PencilSimple } from "@phosphor-icons/react";
import { toast } from "sonner";

interface PaymentMethod {
  id: string;
  code: string;
  name: string;
  name_en: string | null;
  type: "online_gateway" | "offline_manual";
  enabled: boolean;
  sort_order: number;
}

const columns: ColumnDef<PaymentMethod>[] = [
  { header: "Code", accessor: (r) => <span className="font-mono text-sm">{r.code}</span> },
  { header: "Name", accessor: (r) => <span className="text-sm">{r.name}{r.name_en ? <span className="text-xs text-gray-400 ml-1">({r.name_en})</span> : null}</span> },
  {
    header: "Type", accessor: (r) => (
      <Badge variant="outline" className="text-xs">
        {r.type === "online_gateway" ? "在线网关" : "线下手动"}
      </Badge>
    ),
  },
  {
    header: "Status", accessor: (r) => (
      <Badge className={r.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
        {r.enabled ? "启用" : "禁用"}
      </Badge>
    ),
  },
  { header: "Sort", accessor: (r) => <span className="text-xs text-gray-400">{r.sort_order}</span> },
];

export default function AdminPaymentMethodsPage() {
  const { t } = useI18n();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PaymentMethod | null>(null);
  const [form, setForm] = useState({ code: "", name: "", name_en: "", type: "offline_manual" as PaymentMethod["type"], sort_order: 0 });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/payment-methods");
      const json = await res.json();
      setMethods(json.data || []);
    } catch {
      toast.error("Failed to load payment methods");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ code: "", name: "", name_en: "", type: "offline_manual", sort_order: 0 });
    setEditOpen(true);
  };

  const openEdit = (m: PaymentMethod) => {
    setEditTarget(m);
    setForm({ code: m.code, name: m.name, name_en: m.name_en || "", type: m.type, sort_order: m.sort_order });
    setEditOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = { name: form.name, name_en: form.name_en || undefined, type: form.type, sort_order: form.sort_order };
      let res;
      if (editTarget) {
        res = await apiFetch(`/api/admin/payment-methods/${editTarget.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        res = await apiFetch("/api/admin/payment-methods", { method: "POST", body: JSON.stringify({ ...body, code: form.code }) });
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || "Save failed");
      toast.success(editTarget ? "Updated" : "Created");
      setEditOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (m: PaymentMethod) => {
    try {
      const res = await apiFetch(`/api/admin/payment-methods/${m.id}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: !m.enabled }),
      });
      if (!res.ok) throw new Error();
      load();
    } catch {
      toast.error("Toggle failed");
    }
  };

  return (
    <>
      <PageHeader
        title="收款方式"
        description="管理线下/自定义收款方式。PayPal 和 Stripe 为系统内置，不在此列表。"
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> 新增方式
          </Button>
        }
      />

      <DataTable
        data={methods}
        columns={columns}
        keyExtractor={(r) => r.id}
        loading={loading}
        rowActions={(row) => (
          <>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(row)}>
              <PencilSimple className="h-3.5 w-3.5 text-gray-500" />
            </Button>
            <Switch checked={row.enabled} onCheckedChange={() => toggleEnabled(row)} className="ml-2" />
          </>
        )}
      />

      <Dialog open={editOpen} onOpenChange={(o) => { if (!saving) setEditOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? "编辑收款方式" : "新增收款方式"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Code * {editTarget && <span className="text-xs text-gray-400">(不可修改)</span>}</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                placeholder="e.g. cod, bank_transfer"
                disabled={!!editTarget}
              />
              {!editTarget && <p className="text-xs text-gray-400">小写字母开头，只含小写/数字/下划线，2-31 字符</p>}
            </div>
            <div className="space-y-2">
              <Label>名称 *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>英文名称</Label>
              <Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>类型</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as PaymentMethod["type"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="offline_manual">线下手动</SelectItem>
                  <SelectItem value="online_gateway">在线网关</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>排序</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={save} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
