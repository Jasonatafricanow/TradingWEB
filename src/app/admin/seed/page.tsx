"use client"

import { useState } from "react"
import { useI18n } from "@/contexts/i18n-context"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { PageHeader } from "../_components";
import { CheckCircle, Database, Sparkle, Trash, WarningCircle } from "@phosphor-icons/react";

export default function AdminSeedPage() {
  const { t } = useI18n()
  const [seeding, setSeeding] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [loading] = useState(false) // skeleton demo state

  const handleSeed = async () => {
    setSeeding(true)
    setResult(null)
    try {
      const res = await fetch("/api/admin/seed", { method: "POST" })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setResult({ type: "seed", data: json.data })
      toast.success("演示数据已生成")
    } catch (err) {
      toast.error(err instanceof Error ? (err as Error).message : "生成失败")
    } finally { setSeeding(false) }
  }

  const handleClear = async () => {
    if (!confirm("确定要一键清除所有演示数据？此操作不可恢复！")) return
    setClearing(true)
    try {
      const res = await fetch("/api/admin/seed", { method: "DELETE" })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setResult({ type: "clear" })
      toast.success("演示数据已清除")
    } catch (err) {
      toast.error(err instanceof Error ? (err as Error).message : "清除失败")
    } finally { setClearing(false) }
  }

  if (loading) {
    return (
      <div className="flex"><div className="flex-1 p-8 space-y-4">
          <Skeleton className="h-8 w-64 mb-6" />
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-72 w-full rounded-lg" />
            <Skeleton className="h-72 w-full rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  
  return (
    <div className="flex"><div className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6" /> {t("seed.title")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("seed.desc")}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* 生成 */}
          <Card className="border-blue-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkle className="h-5 w-5 text-blue-600" />
                <CardTitle>生成演示数据</CardTitle>
              </div>
              <CardDescription>
                自动创建 6 个分类、15 个商品、库存记录
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="text-sm space-y-2">
                <li className="flex items-center gap-2">✅ 商业咨询 / 技术顾问 / 语言培训（咨询服务）</li>
                <li className="flex items-center gap-2">✅ 数字模板 / 在线课程 / 电子书籍（虚拟商品）</li>
                <li className="flex items-center gap-2">✅ 多语言标题（中/英/葡）</li>
                <li className="flex items-center gap-2">✅ 库存记录（虚拟商品 999 / 服务 50）</li>
              </ul>
              <Button onClick={handleSeed} disabled={seeding} className="w-full bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                {seeding ? t("seed.generating") : t("seed.btn_generate")}
              </Button>
              {result?.type === "seed" && (
                <p className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  已生成 {result.data.categories} 个分类、{result.data.products} 个商品
                </p>
              )}
            </CardContent>
          </Card>

          {/* 清除 */}
          <Card className="border-red-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Trash className="h-5 w-5 text-red-500" />
                <CardTitle>清除演示数据</CardTitle>
              </div>
              <CardDescription>
                一键删除所有演示数据，保留系统设置
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg text-sm text-red-700">
                <WarningCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>将删除：所有商品、订单、库存、评论、优惠券、会员记录、操作日志、页面访问数据、邮件记录、弃单、调拨、对话消息</span>
              </div>
              <div className="text-sm text-green-600 flex items-center gap-2 p-2">
                <CheckCircle className="h-4 w-4" />
                保留：分类结构、会员等级体系、邮件模板、系统设置
              </div>
              <Button onClick={handleClear} disabled={clearing} variant="destructive" className="w-full">
                {clearing ? "清除中..." : "一键清除演示数据"}
              </Button>
              {result?.type === "clear" && (
                <p className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  所有演示数据已清除
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
