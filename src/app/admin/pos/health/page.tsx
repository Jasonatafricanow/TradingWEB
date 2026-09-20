"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../../_components";

interface Health { store_id: string; event_count: number; sync_backlog: number; by_type: Record<string, number>; last_event_at: string | null }

export default function PosHealthPage() {
  const [storeId, setStoreId] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { setStoreId(localStorage.getItem("pos_store_id") ?? ""); }, []);
  async function load() {
    setError("");
    const response = await apiFetch(`/api/admin/pos/telemetry/health?store_id=${encodeURIComponent(storeId)}`);
    const json = await response.json().catch(() => ({}));
    if (!response.ok) { setError(json?.error?.message ?? "加载失败"); return; }
    setHealth(json.data);
  }
  return <div className="space-y-6">
    <PageHeader title="POS 运行健康" description="最近 24 小时结构化故障；不采集 PIN、令牌、客户地址或支付凭证。" />
    <div className="flex gap-2"><Input value={storeId} onChange={(event) => setStoreId(event.target.value)} placeholder="门店 ID" /><Button onClick={load} disabled={!storeId}>刷新</Button></div>
    {error && <p className="text-sm text-destructive">{error}</p>}
    {health && <div className="grid gap-4 md:grid-cols-3">
      <Card><CardHeader><CardTitle>待同步积压</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{health.sync_backlog}</CardContent></Card>
      <Card><CardHeader><CardTitle>故障事件</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{health.event_count}</CardContent></Card>
      <Card><CardHeader><CardTitle>最近事件</CardTitle></CardHeader><CardContent>{health.last_event_at ? new Date(health.last_event_at).toLocaleString() : "无"}</CardContent></Card>
      {Object.entries(health.by_type).map(([type, count]) => <Card key={type}><CardHeader><CardTitle>{type}</CardTitle></CardHeader><CardContent>{count}</CardContent></Card>)}
    </div>}
  </div>;
}
