"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatMoney } from "@/lib/format"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { PageHeader } from "../_components";
import { CalendarBlank, CheckCircle, PaperPlaneTilt, Spinner, WarningCircle } from "@phosphor-icons/react";

export default function AdminBriefingPage() {
  const [key, setKey] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const trigger = async () => {
    if (!key) return toast.error("请输入 CRON_SECRET")
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/cron/daily-briefing?key=${encodeURIComponent(key)}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setResult(json)
      toast.success("简报已生成")
    } catch (err) {
      toast.error(err instanceof Error ? (err as Error).message : "触发失败")
    } finally { setLoading(false) }
  }

  if (loading) {
    return (
      <div className="flex"><div className="flex-1 p-8 space-y-4">
          <div className="flex items-center gap-2 mb-6">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-8 w-48" />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-64 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  
  return (
    <div className="flex"><div className="flex-1 p-8">
        <div className="flex items-center gap-2 mb-6">
          <CalendarBlank className="h-6 w-6" />
          <h1 className="text-2xl font-bold">每日财经早报</h1>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>手动触发</CardTitle>
              <CardDescription>输入 CRON_SECRET 立即生成一份简报</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>CRON_SECRET</Label>
                <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="环境变量中配置的密钥" />
              </div>
              <Button onClick={trigger} disabled={loading} className="w-full">
                {loading ? <><Spinner className="h-4 w-4 mr-2" /> 生成中...</> : <><PaperPlaneTilt className="h-4 w-4 mr-2" /> 生成简报</>}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>自动调度</CardTitle>
              <CardDescription>每天早上 8:00 (UTC+8) 自动生成并发送邮件</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-green-600"><CheckCircle className="h-4 w-4" /> Vercel Cron: 已配置</div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <WarningCircle className="h-4 w-4" />
                外部也可以用 cron-job.org 定时 POST
              </div>
              <div className="p-3 bg-gray-50 rounded text-xs font-mono">
                POST /api/cron/daily-briefing<br />
                Header: x-cron-secret: YOUR_SECRET
              </div>
            </CardContent>
          </Card>
        </div>

        {result && (
          <Card className="mt-6">
            <CardHeader><CardTitle>简报摘要</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="p-3 bg-blue-50 rounded text-center">
                  <div className="text-lg font-bold text-blue-600">${formatMoney(result.summary?.revenue) || "0.00"}</div>
                  <div className="text-xs text-muted-foreground">收入</div>
                </div>
                <div className="p-3 bg-green-50 rounded text-center">
                  <div className="text-lg font-bold text-green-600">{result.summary?.orders || 0}</div>
                  <div className="text-xs text-muted-foreground">订单</div>
                </div>
                <div className="p-3 bg-cyan-50 rounded text-center">
                  <div className="text-lg font-bold text-cyan-600">{result.summary?.pv || 0}</div>
                  <div className="text-xs text-muted-foreground">浏览量</div>
                </div>
                <div className="p-3 bg-red-50 rounded text-center">
                  <div className="text-lg font-bold text-red-600">{result.summary?.lowStock || 0}</div>
                  <div className="text-xs text-muted-foreground">低库存</div>
                </div>
                <div className="p-3 bg-purple-50 rounded text-center">
                  <div className="text-lg font-bold text-purple-600">{result.summary?.recovered || 0}</div>
                  <div className="text-xs text-muted-foreground">弃单挽回</div>
                </div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                邮件发送: {result.emailSent ? "✅ 成功" : "❌ 失败"}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
