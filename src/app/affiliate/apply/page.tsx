"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { ShareNetwork, Spinner } from "@phosphor-icons/react";

export default function AffiliateApplyPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [nickname, setNickname] = useState("")
  const [loading, setLoading] = useState(false)

  const handleApply = async () => {
    if (!nickname.trim()) return toast.error("请填写推广昵称")
    setLoading(true)
    try {
      const res = await fetch("/api/affiliates/apply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      router.push("/affiliate/applying")
    } catch (err) {
      toast.error((err as Error).message || "申请失败")
    } finally { setLoading(false) }
  }

  if (!user) return <div className="mx-auto max-w-md py-20 text-center"><p>请先登录</p></div>

  return (
    <div className="mx-auto max-w-md py-12 px-4">
      <Card>
        <CardHeader className="text-center">
          <ShareNetwork className="mx-auto h-10 w-10 text-blue-500 mb-2" />
          <CardTitle className="text-xl">申请成为推广者</CardTitle>
          <p className="text-sm text-muted-foreground">分享商品链接，赚取佣金</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>推广昵称</Label>
            <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="如: Tommy" />
            <p className="text-xs text-muted-foreground mt-1">将根据昵称自动生成专属推广码</p>
          </div>
          <Button onClick={handleApply} disabled={loading} className="w-full">
            {loading ? <Spinner className="h-4 w-4 mr-2" /> : null}
            提交申请
          </Button>
          <p className="text-xs text-center text-muted-foreground">提交后需管理员审核通过方可生效</p>
        </CardContent>
      </Card>
    </div>
  )
}
