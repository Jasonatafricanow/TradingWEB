"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Copy, CurrencyDollar, ShareNetwork, SignOut, TrendUp, Users, Warning } from "@phosphor-icons/react";

export default function AffiliateDashboardPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [affiliate, setAffiliate] = useState<any>(null)
  const [dashboard, setDashboard] = useState<any>(null)
  const [extra, setExtra] = useState<any>(null)
  const [eligibility, setEligibility] = useState<any>(null)
  const [settlement, setSettlement] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showExitDialog, setShowExitDialog] = useState(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    if (!user) return
    Promise.all([
      fetch("/api/affiliates/me").then(r => r.json()),
      fetch("/api/affiliates/dashboard").then(r => r.json()),
      fetch("/api/affiliates/dashboard/extra").then(r => r.json()),
      fetch("/api/affiliates/eligibility").then(r => r.json()),
    ]).then(([me, dash, ext, elig]) => {
      setAffiliate(me.data)
      setDashboard(dash.data)
      setExtra(ext.data)
      setEligibility(elig.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [user])

  const handleExit = async () => {
    setExiting(true)
    try {
      const res = await fetch("/api/affiliates/exit", { method: "POST" })
      const json = await res.json()
      setSettlement(json.data)
      toast.success("退出结算完成")
      window.location.reload()
    } catch { toast.error("退出失败") }
    finally { setExiting(false) }
  }

  if (loading) return <div className="mx-auto max-w-4xl py-20 text-center"><p>加载中...</p></div>
  if (!affiliate) return <div className="mx-auto max-w-md py-20 text-center"><p>您还不是推广者</p><Button onClick={() => router.push("/affiliate/apply")} className="mt-4">申请成为推广者</Button></div>
  if (affiliate.status === "deactivated") return <div className="mx-auto max-w-md py-20 text-center"><Alert variant="destructive"><Warning className="h-4 w-4" /><AlertTitle>已退出</AlertTitle><AlertDescription>您的推广账户已停用。</AlertDescription></Alert></div>

  const refUrl = `${window.location.origin}/ref/${affiliate.code}`
  const copyLink = () => { navigator.clipboard.writeText(refUrl); toast.success("推广链接已复制") }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6"><ShareNetwork className="h-6 w-6" /> 推广中心</h1>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">累计收益</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">${parseFloat(affiliate.total_earned || "0").toFixed(2)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">可提现余额</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-blue-600">${parseFloat(affiliate.balance || "0").toFixed(2)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">推广订单</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{dashboard?.totalReferrals || 0}</div></CardContent></Card>
      </div>

      {/* 推广链接 */}
      <Card className="mb-6"><CardContent className="p-4 flex items-center gap-3">
        <div className="flex-1"><p className="text-sm text-muted-foreground mb-1">推广链接</p><code className="text-sm bg-gray-100 px-2 py-1 rounded block truncate">{refUrl}</code></div>
        <Button variant="outline" size="sm" onClick={copyLink}><Copy className="h-4 w-4 mr-1" /> 复制</Button>
      </CardContent></Card>

      {/* 提现资格/进度 */}
      {!eligibility?.eligible && (
        <Card className="mb-6 border-yellow-200">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Warning className="h-4 w-4 text-yellow-500" /> 提现条件未满足</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm mb-2">{eligibility?.reason}</p>
            <Progress value={(eligibility?.achieved / eligibility?.required) * 100} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">{extra?.pushedOrders}/{extra?.targetOrders} 单推广</p>
            {extra?.daysLeft > 0 && <p className="text-xs text-muted-foreground">还需等待 {extra.daysLeft} 天</p>}
          </CardContent>
        </Card>
      )}

      {eligibility?.eligible && (
        <Card className="mb-6 border-green-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-green-700 font-medium">可提现</p><p className="text-xs text-muted-foreground">最多 ${eligibility.maxWithdrawable.toFixed(2)}</p></div>
            <Button onClick={() => router.push("/affiliate/payouts")}><CurrencyDollar className="h-4 w-4 mr-1" /> 申请提现</Button>
          </CardContent>
        </Card>
      )}

      {/* 退出按钮 */}
      {extra?.canExit && extra?.pushedOrders < extra?.targetOrders && (
        <div className="mb-6">
          <Button variant="outline" className="text-orange-500 border-orange-200" onClick={() => setShowExitDialog(true)}>
            <SignOut className="h-4 w-4 mr-1" /> 退出推广（按比例结算）
          </Button>
        </div>
      )}

      {/* 推广记录 */}
      <Card>
        <CardHeader><CardTitle className="text-base">推广记录</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left p-3">订单</th><th className="text-left p-3">佣金</th><th className="text-left p-3">费率</th><th className="text-left p-3">状态</th><th className="text-left p-3">时间</th></tr></thead>
            <tbody>{(!dashboard?.referrals || dashboard.referrals.length === 0) ? (
              <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">暂无推广记录</td></tr>
            ) : dashboard.referrals.map((r: { id: string; order_id?: string; commission?: string; rate?: string; status?: string; created_at: string }) => (
              <tr key={r.id} className="border-b"><td className="p-3">{r.order_id?.slice(0, 8)}</td><td className="p-3">${parseFloat(r.commission || "0").toFixed(2)}</td><td className="p-3">{r.rate}%</td><td className="p-3"><Badge variant={r.status === "paid" ? "default" : "secondary"}>{r.status}</Badge></td><td className="p-3">{new Date(r.created_at).toLocaleDateString()}</td></tr>
            ))}</tbody>
          </table>
        </CardContent>
      </Card>

      {/* 退出弹窗 */}
      <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>退出推广</DialogTitle>
            <DialogDescription>退出后您的推广账户将停用，未满 5 单的佣金将按比例结算。</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <p>当前锁定佣金: <strong>${parseFloat(affiliate.balance || "0").toFixed(2)}</strong></p>
            {settlement && <p>结算金额: <strong>${settlement.finalPayout?.toFixed(2)}</strong></p>}
            {settlement && <p className="text-xs text-muted-foreground">{settlement.settlementNote}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowExitDialog(false)}>取消</Button>
            <Button variant="destructive" onClick={handleExit} disabled={exiting}>
              {exiting ? "处理中..." : "确认退出"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
