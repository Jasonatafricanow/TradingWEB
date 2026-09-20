"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Clock, ShareNetwork } from "@phosphor-icons/react";

export default function AffiliateApplyingPage() {
  return (
    <div className="mx-auto max-w-md py-20 px-4 text-center">
      <Card>
        <CardHeader>
          <Clock className="mx-auto h-12 w-12 text-yellow-500 mb-2" />
          <CardTitle className="text-xl">申请已提交</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            您的推广申请已提交，管理员审核通过后即可开始推广。
          </p>
          <p className="text-sm text-muted-foreground">审核结果将通过站内通知告知您。</p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" asChild><Link href="/">返回首页</Link></Button>
            <Button asChild><Link href="/affiliate/dashboard"><ShareNetwork className="h-4 w-4 mr-1" /> 查看状态</Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
