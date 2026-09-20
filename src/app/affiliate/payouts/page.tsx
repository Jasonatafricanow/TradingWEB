"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "sonner"
import { CheckCircle, CurrencyDollar, Spinner, Warning } from "@phosphor-icons/react";

export default function AffiliatePayoutsPage() {
  const [affiliate, setAffiliate] = useState<any>(null)
  const [eligibility, setEligibility] = useState<any>(null)
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch("/api/affiliates/me").then(r => r.json()),
      fetch("/api/affiliates/eligibility").then(r => r.json()),
    ]).then(([me, elig]) => {
      setAffiliate(me.data)
      setEligibility(elig.data)
    }).catch(() => {}).finally(() => setFetching(false))
  }, [])

  const handleRequest = async () => {
    if (!amount || parseFloat(amount) <= 0) return toast.error("请输入有效金额")
    if (parseFloat(amount) > (eligibility?.maxWithdrawable || 0)) return toast.error("超出可提现金额")
    setLoading(true)
    try {
      const res = await fetch("/api/affiliates/request-payout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(amount) }),
      })
      if (!res.ok) throw new Error()
      toast.success("提现申请已提交")
      setAmount("")
      const j = await fetch("/api/affiliates/me").then(r => r.json())
      setAffiliate(j.data)
    } catch { toast.error("提现申请失败") }
    finally { setLoading(false) }
  }

  if (fetching) return <div className="mx-auto max-w-md py-20 text-center">加载中...</div>

  return (
    <div className="mx-auto max-w-md py-12 px-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CurrencyDollar className="h-5 w-5" /> 申请提现</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 rounded-lg bg-gray-50">
            <p className="text-sm text-muted-foreground">可提现余额</p>
            <p className="text-2xl font-bold text-green-600">${parseFloat(affiliate?.balance || "0").toFixed(2)}</p>
          </div>

          {/* 提现资格 */}
          {eligibility && !eligibility.eligible && (
            <Alert variant="destructive">
              <Warning className="h-4 w-4" />
              <AlertTitle>暂不可提现</AlertTitle>
              <AlertDescription>{eligibility.reason}</AlertDescription>
            </Alert>
          )}
          {eligibility?.eligible && (
            <Alert variant="default" className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-700">可提现</AlertTitle>
              <AlertDescription className="text-green-600">
                最多可提现 ${eligibility.maxWithdrawable.toFixed(2)}
              </AlertDescription>
            </Alert>
          )}

          <div>
            <Label>提现金额</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" min="1" disabled={!eligibility?.eligible} />
          </div>
          <Button onClick={handleRequest} disabled={loading || !eligibility?.eligible} className="w-full">
            {loading ? <Spinner className="h-4 w-4 mr-2" /> : null}
            申请提现
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
