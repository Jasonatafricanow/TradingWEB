// /ref/[code] — 推广落地页：带着 ?ref= 跳转首页，由前端按归因有效期保存（src/lib/affiliate-ref.ts）。
// （页面渲染时不能写 Cookie；原实现在 Next 里会直接报错。）
import { redirect } from "next/navigation"

export default async function RefPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const safe = /^[A-Za-z0-9_-]{1,50}$/.test(code) ? code : ""
  redirect(safe ? `/?ref=${encodeURIComponent(safe)}` : "/")
}
