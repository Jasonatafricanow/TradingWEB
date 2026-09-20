"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/client-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { PageHeader } from "../../_components";
import { ArrowLeft, Printer } from "@phosphor-icons/react";

interface StoreOption { id: string; name: string; status: string }

interface DailyReport {
  store: { id: string; name: string } | null;
  date: string;
  order_count: number;
  total_amount: number;
  by_payment_method: { method: string; count: number; amount: number }[];
  orders: {
    order_no: string;
    created_at: string;
    total_amount: number;
    discount_amount: number;
    payment_method: string | null;
    buyer_phone: string | null;
  }[];
}

const PAYMENT_LABELS: Record<string, string> = { cash: "现金", card: "刷卡", transfer: "转账" };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PosReportPage() {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeId, setStoreId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch("/api/admin/stores")
      .then((r) => r.json())
      .then((j) => {
        const active = (j.data || []).filter((s: StoreOption) => s.status === "active");
        setStores(active);
        const saved = localStorage.getItem("pos_store_id");
        if (saved && active.some((s: StoreOption) => s.id === saved)) setStoreId(saved);
        else if (active.length === 1) setStoreId(active[0].id);
      })
      .catch(() => toast.error("门店列表加载失败"));
  }, []);

  const loadReport = useCallback(async () => {
    if (!storeId || !date) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/pos/daily-report?store_id=${storeId}&date=${date}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || "加载失败");
      setReport(json.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [storeId, date]);

  useEffect(() => { loadReport(); }, [loadReport]);

  return (
    <>
      <style>{`@media print { body * { visibility: hidden; } #pos-daily-report, #pos-daily-report * { visibility: visible; } #pos-daily-report { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
      <PageHeader
        title="POS 日结"
        description="按门店按日的销售汇总,供班末对账"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/admin/pos">
              <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> 返回收银</Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!report}>
              <Printer className="h-4 w-4 mr-1" /> 打印
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={storeId || "__none__"} onValueChange={(v) => setStoreId(v === "__none__" ? "" : v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="选择门店" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">选择门店</SelectItem>
            {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="w-40" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {loading && <p className="text-sm text-gray-400">加载中...</p>}
      {!loading && !storeId && <p className="text-sm text-gray-400">请先选择门店</p>}

      {!loading && report && (
        <div id="pos-daily-report" className="space-y-4">
          <div className="hidden print:block text-center mb-2">
            <p className="font-bold">{report.store?.name} · POS 日结 · {report.date}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm text-gray-500">销售单数</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{report.order_count}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm text-gray-500">销售总额</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">${report.total_amount.toFixed(2)}</p></CardContent>
            </Card>
            {report.by_payment_method.map((m) => (
              <Card key={m.method}>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm text-gray-500">{PAYMENT_LABELS[m.method] || m.method}({m.count} 单)</CardTitle>
                </CardHeader>
                <CardContent><p className="text-2xl font-bold">${m.amount.toFixed(2)}</p></CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">交易明细 ({report.orders.length})</CardTitle></CardHeader>
            <CardContent>
              {report.orders.length === 0 && <p className="text-sm text-gray-400 py-3">当日无 POS 交易</p>}
              {report.orders.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-gray-500 text-left">
                      <th className="py-2">单号</th>
                      <th className="py-2">时间</th>
                      <th className="py-2">收款方式</th>
                      <th className="py-2">客户</th>
                      <th className="py-2 text-right">折扣</th>
                      <th className="py-2 text-right">金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.orders.map((o) => (
                      <tr key={o.order_no} className="border-b last:border-0">
                        <td className="py-2 font-mono text-xs">{o.order_no}</td>
                        <td className="py-2 text-xs text-gray-500">
                          {new Date(o.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-2">{PAYMENT_LABELS[o.payment_method || ""] || o.payment_method || "—"}</td>
                        <td className="py-2 text-xs text-gray-500">{o.buyer_phone || "—"}</td>
                        <td className="py-2 text-right text-gray-500">
                          {o.discount_amount > 0 ? `-$${o.discount_amount.toFixed(2)}` : "—"}
                        </td>
                        <td className="py-2 text-right font-mono">${o.total_amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
