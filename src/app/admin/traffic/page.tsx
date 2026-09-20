"use client"

import { useEffect, useState } from "react"
import { useI18n } from "@/contexts/i18n-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Legend, PieChart, Pie, Cell,
} from "@/components/charts"
import { toast } from "sonner"
import { PageHeader } from "../_components";
import { ArrowSquareOut, ArrowsClockwise, Eye, Globe, Users, WhatsappLogo } from "@phosphor-icons/react";

interface TrafficSummary {
  totalPv: number
  totalUv: number
  productPageViews: number
  topPages: { path: string; count: number; title?: string }[]
  dailyTrend: { date: string; pv: number; uv: number }[]
  referrers: { source: string; count: number }[]
  whatsappClicks: number
  uniqueWaVisitors: number
  conversionRate: number
  checkoutCount: number
  paidOrderCount: number
  funnelSteps: { label: string; count: number; rate: number }[]
}

const COLORS = ["#3b82f6", "#22c55e", "#eab308", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"]

export default function AdminTrafficPage() {
  const { t } = useI18n()
  const [days, setDays] = useState("30")
  const [data, setData] = useState<TrafficSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/traffic?days=${days}`)
      const json = await res.json()
      setData(json.data || null)
    } catch {
      toast.error("加载流量数据失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [days])

  if (loading) {
    return (
      <div className="flex"><div className="flex-1 p-8 space-y-4">
          <div className="flex items-center justify-between mb-8">
            <div>
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64 mt-2" />
            </div>
            <Skeleton className="h-9 w-32" />
          </div>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
          </div>
          <Skeleton className="h-80 w-full rounded-lg mb-6" />
          <div className="grid grid-cols-2 gap-6">
            <Skeleton className="h-80 w-full rounded-lg" />
            <Skeleton className="h-80 w-full rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  
  return (
    <div className="flex"><div className="flex-1 p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Globe className="h-6 w-6" /> 流量分析
            </h1>
            <p className="text-muted-foreground mt-1">页面访问量、访客来源和内容表现</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">近 7 天</SelectItem>
                <SelectItem value="30">近 30 天</SelectItem>
                <SelectItem value="90">近 90 天</SelectItem>
              </SelectContent>
            </Select>
            <button
              onClick={loadData}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-3 border"
            >
              <ArrowsClockwise className="h-4 w-4 mr-1" /> 刷新
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                <Eye className="h-3 w-3" /> 总浏览量 (PV)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {data?.totalPv.toLocaleString() || "0"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" /> 独立访客 (UV)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {data?.totalUv.toLocaleString() || "0"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                <WhatsappLogo className="h-3 w-3 text-green-600" /> WhatsApp 点击
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {data?.whatsappClicks.toLocaleString() || "0"}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>去重访客: {data?.uniqueWaVisitors || 0}</span>
                <span>PV→WA 转化率: {data?.conversionRate || 0}%</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                <ArrowSquareOut className="h-3 w-3" /> 来源数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data?.referrers.length || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* PV/UV Trend */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">访问趋势</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.dailyTrend || []}>
                  <defs>
                    <linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="uvGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="pv" name="PV" stroke="#3b82f6" fill="url(#pvGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="uv" name="UV" stroke="#22c55e" fill="url(#uvGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-6">
          {/* Page Ranking */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">页面访问排行</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>页面</TableHead>
                    <TableHead>访问量</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.topPages || []).slice(0, 15).map((page, i) => (
                    <TableRow key={page.path}>
                      <TableCell className="max-w-48 truncate" title={page.path}>
                        <span className="text-xs text-muted-foreground mr-2">{i + 1}</span>
                        {page.title || page.path}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{page.count}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!data?.topPages || data.topPages.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                        {loading ? "加载中..." : "暂无数据 — 请确保前端埋点已启用"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Referrer Analysis */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">来源分析</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={(data?.referrers || []).slice(0, 8)}
                      dataKey="count"
                      nameKey="source"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ source, percent }) => `${source} ${(percent * 100).toFixed(0)}%`}
                    >
                      {(data?.referrers || []).slice(0, 8).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 转化漏斗 */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">转化漏斗 (PV → WhatsApp → 下单 → 支付)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(data?.funnelSteps || []).map((step, i) => {
                const maxCount = (data?.funnelSteps || [])[0]?.count || 1;
                const barWidth = Math.max(2, (step.count / maxCount) * 100);
                return (
                  <div key={step.label} className="flex items-center gap-3">
                    <span className="w-24 text-sm text-right font-medium">{step.label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                      <div
                        className="h-full rounded-full flex items-center justify-end px-2 text-xs text-white font-medium"
                        style={{
                          width: `${barWidth}%`,
                          background: i === 0 ? '#3b82f6' : i === 1 ? '#22c55e' : i === 2 ? '#25D366' : i === 3 ? '#f59e0b' : '#10b981',
                        }}
                      >
                        {step.count.toLocaleString()}
                      </div>
                    </div>
                    <span className="w-16 text-xs text-muted-foreground text-right">{step.rate}%</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
