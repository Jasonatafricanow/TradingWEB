"use client"

import { useCallback, useEffect, useState } from "react"
import { apiFetch } from "@/lib/client-api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatMoney } from "@/lib/format"
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
  AreaChart, Area, Legend,
} from "@/components/charts"
import { toast } from "sonner"
import { ArrowsClockwise, CurrencyDollar, Download, Percent, ShoppingCart, Storefront, TrendUp, Trophy } from "@phosphor-icons/react";

interface SalesSummary {
  totalRevenue: number
  totalOrders: number
  totalRefunds: number
  refundRate: number
  avgOrderValue: number
}

interface ProductRank {
  product_id: string
  product_title: string
  product_type: string
  total_quantity: number
  total_revenue: number
  order_count: number
}

interface RevenueTrend {
  date: string
  revenue: number
  orders: number
}

interface ChannelBreakdown {
  source: string
  label: string
  total_revenue: number
  total_orders: number
  avg_order_value: number
  revenue_share: number
}

export default function AdminSalesPage() {
  const [days, setDays] = useState("30")
  const [summary, setSummary] = useState<SalesSummary | null>(null)
  const [ranks, setRanks] = useState<ProductRank[]>([])
  const [trend, setTrend] = useState<RevenueTrend[]>([])
  const [channels, setChannels] = useState<ChannelBreakdown[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/admin/sales?days=${days}`)
      const json = await res.json()
      if (json.data) {
        setSummary(json.data.summary)
        setRanks(json.data.productRanks || [])
        setTrend(json.data.revenueTrend || [])
        setChannels(json.data.channelBreakdown || [])
      }
    } catch {
      toast.error("加载销售数据失败")
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { loadData() }, [loadData])

  const handleExport = async () => {
    try {
      const res = await apiFetch(`/api/admin/sales?days=${days}&format=csv`)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `sales_rank_${days}d.csv`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error("导出失败")
    }
  }

  if (loading) {
    return (
      <div className="flex"><div className="flex-1 p-8 space-y-4">
          <div className="flex items-center justify-between mb-8">
            <div>
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64 mt-2" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
          </div>
          <Skeleton className="h-80 w-full rounded-lg mb-6" />
          <Skeleton className="h-80 w-full rounded-lg" />
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
              <TrendUp className="h-6 w-6" /> 销售管理
            </h1>
            <p className="text-muted-foreground mt-1">查看销售数据、商品排行和收入趋势</p>
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
                <SelectItem value="365">近一年</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={loadData}>
              <ArrowsClockwise className="h-4 w-4 mr-1" /> 刷新
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" /> 导出 CSV
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                <CurrencyDollar className="h-3 w-3" /> 总收入
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                ${formatMoney(summary?.totalRevenue) || "0.00"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                <ShoppingCart className="h-3 w-3" /> 订单数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.totalOrders || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                <Trophy className="h-3 w-3" /> 客单价
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${formatMoney(summary?.avgOrderValue) || "0.00"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                <Percent className="h-3 w-3" /> 退款率
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {((summary?.refundRate || 0) * 100).toFixed(1)}%
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Storefront className="h-4 w-4" /> 渠道贡献
            </CardTitle>
          </CardHeader>
          <CardContent>
            {channels.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">暂无渠道销售数据</div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channels}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="total_revenue" name="收入 ($)" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>渠道</TableHead>
                        <TableHead className="text-right">收入</TableHead>
                        <TableHead className="text-right">订单</TableHead>
                        <TableHead className="text-right">占比</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {channels.map((channel) => (
                        <TableRow key={channel.source}>
                          <TableCell className="font-medium">{channel.label}</TableCell>
                          <TableCell className="text-right text-green-600 font-medium">
                            ${formatMoney(channel.total_revenue)}
                          </TableCell>
                          <TableCell className="text-right">{channel.total_orders}</TableCell>
                          <TableCell className="text-right">
                            {(channel.revenue_share * 100).toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue Trend Chart */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">收入趋势</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone" dataKey="revenue" name="收入 ($)"
                    stroke="#3b82f6" fill="url(#revenueGrad)" strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Product Sales Ranking */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">商品销量排行</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>排名</TableHead>
                  <TableHead>商品名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>销量</TableHead>
                  <TableHead>收入</TableHead>
                  <TableHead>订单数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {loading ? "加载中..." : "暂无销售数据"}
                    </TableCell>
                  </TableRow>
                ) : (
                  ranks.slice(0, 50).map((item, i) => (
                    <TableRow key={item.product_id}>
                      <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{item.product_title}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {item.product_type === "service" ? "咨询服务" : "虚拟商品"}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.total_quantity}</TableCell>
                      <TableCell className="text-green-600 font-medium">
                        ${formatMoney(item.total_revenue)}
                      </TableCell>
                      <TableCell>{item.order_count}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
