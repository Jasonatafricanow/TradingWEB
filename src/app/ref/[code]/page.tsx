// /ref/[code] — 推广落地页（设置 Cookie 后跳转首页）
import { redirect } from "next/navigation"
import { cookies } from "next/headers"

export default async function RefPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const cookieStore = await cookies()

  // 设置推广 Cookie，30 天有效
  cookieStore.set("affiliate_code", code.toUpperCase(), {
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  })

  // 重定向到首页
  redirect("/")
}
