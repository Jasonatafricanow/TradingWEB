"use client"
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Gear, Envelope, User, Spinner, FloppyDisk, Crown, TrendUp, MapPin, Phone,
  Plus, Trash, Wallet, Gift, Tag, Clock,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { BreadcrumbPublic } from "@/components/breadcrumb-public";

interface MembershipInfo {
  id: string
  total_spent: string
  total_orders: number
  joined_at: string
  tier?: {
    id: string
    name: string
    level: number
    discount_percent: string
    badge_color?: string
    benefits?: string
  }
}

interface WalletInfo {
  balance: number
  currency: string
  updated_at: string
}

interface AvailableCoupon {
  id: string
  code: string
  description: string
  discount: string
  expires_at: string
  is_used: boolean
}

export default function AccountPage() {
  const router = useRouter();
  const { user, getToken } = useAuth();
  const { t, locale } = useI18n();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [membership, setMembership] = useState<MembershipInfo | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [coupons, setCoupons] = useState<AvailableCoupon[]>([]);
  const [loadingMembership, setLoadingMembership] = useState(true);

  useEffect(() => {
    if (!user) {
      router.push("/auth/login");
      return;
    }
    setName(user.name || "");

    // 加载会员信息 + 钱包 + 优惠券
    fetch("/api/memberships/me")
      .then((r) => r.json())
      .then((j) => {
        setMembership(j.data?.membership || null);
        setWallet(j.data?.wallet || null);
        setCoupons(j.data?.coupons || []);
      })
      .catch(() => {})
      .finally(() => setLoadingMembership(false))

    // 加载地址
    fetchAddresses()
  }, [user, router])

  const [addresses, setAddresses] = useState<any[]>([])
  const [addrForm, setAddrForm] = useState({ label: "", phone: "", address_line1: "", address_line2: "", city: "", state: "", zip: "", country: "Moz", is_default: false })
  const [addrOpen, setAddrOpen] = useState(false)

  const fetchAddresses = async () => {
    try {
      const res = await fetch("/api/addresses")
      const json = await res.json()
      setAddresses(json.data || [])
    } catch {}
  }

  const saveAddress = async () => {
    if (!addrForm.address_line1 || !addrForm.city) return toast.error("请填写地址和城市")
    try {
      await fetch("/api/addresses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(addrForm) })
      toast.success("地址已保存"); setAddrOpen(false); setAddrForm({ label: "", phone: "", address_line1: "", address_line2: "", city: "", state: "", zip: "", country: "Moz", is_default: false })
      fetchAddresses()
    } catch { toast.error("保存失败") }
  }

  const deleteAddress = async (id: string) => {
    await fetch("/api/addresses", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
    fetchAddresses()
  }

  const setDefaultAddress = async (id: string) => {
    await fetch("/api/addresses", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, is_default: true }) })
    fetchAddresses()
  };

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      const token = getToken();
      const res = await fetch("/api/auth/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("save failed");
      toast.success(locale === "zh" ? "已保存" : "Saved successfully");
    } catch (err) {
      toast.error(locale === "zh" ? "保存失败" : "Failed to save");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      toast.success(locale === "zh" ? `优惠码 ${code} 已复制` : `Coupon ${code} copied`);
    });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <BreadcrumbPublic items={[{ label: t("crumb.account") }]} />
      <h1 className="text-3xl font-bold text-gray-900">{t("account.title")}</h1>
      <p className="mt-2 text-gray-500">
        {locale === "zh" ? "管理您的个人信息和账户设置" : "Manage your profile and account settings"}
      </p>

      <div className="mt-8 space-y-6">
        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {t("account.profile")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t("account.email")}</Label>
              <div className="flex items-center gap-2">
                <Input value={user.email || ""} disabled className="bg-gray-50" />
                <Envelope className="h-4 w-4 text-gray-400" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("account.name")}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={locale === "zh" ? "输入您的姓名" : "Enter your name"}
              />
            </div>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              {saving ? (
                <Spinner className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FloppyDisk className="mr-2 h-4 w-4" />
              )}
              {t("account.save")}
            </Button>
          </CardContent>
        </Card>

        {/* 钱包余额（生产环境暂未启用：仅当余额 > 0 时展示） */}
        {wallet && wallet.balance > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-green-600" />
              {locale === "zh" ? "我的钱包" : "My Wallet"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingMembership ? (
              <div className="animate-pulse space-y-2">
                <div className="h-8 w-32 bg-gray-200 rounded" />
                <div className="h-4 w-48 bg-gray-200 rounded" />
              </div>
            ) : wallet ? (
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">
                    {locale === "zh" ? "可用余额" : "Available Balance"}
                  </div>
                  <div className="text-3xl font-bold text-green-600 mt-1">
                    ${wallet.balance.toFixed(2)}
                    <span className="text-sm font-normal text-muted-foreground ml-1">{wallet.currency}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {locale === "zh"
                      ? "多付金额自动存入，下次消费可抵扣"
                      : "Overpayments auto-saved. Use on next purchase."}
                  </div>
                </div>
                <div className="hidden sm:flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
                  <Wallet className="h-8 w-8 text-green-500" />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {locale === "zh" ? "暂无余额" : "No balance"}
              </p>
            )}
          </CardContent>
        </Card>
        )}

        {/* 可用优惠券 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-pink-500" />
                {locale === "zh" ? "我的优惠券" : "My Coupons"}
              </div>
              {coupons.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {coupons.length} {locale === "zh" ? "张可用" : "available"}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingMembership ? (
              <div className="animate-pulse space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-20 bg-gray-200 rounded" />
                ))}
              </div>
            ) : coupons.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {locale === "zh" ? "暂无可用优惠券" : "No coupons available"}
              </p>
            ) : (
              <div className="space-y-3">
                {coupons.map((coupon) => {
                  const daysLeft = Math.ceil((new Date(coupon.expires_at).getTime() - Date.now()) / 86400000);
                  return (
                    <div
                      key={coupon.id}
                      className="flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-pink-200 bg-pink-50/50 hover:bg-pink-50 transition-colors cursor-pointer"
                      onClick={() => copyToClipboard(coupon.code)}
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-pink-100">
                        <Tag className="h-6 w-6 text-pink-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm">{coupon.description}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="rounded bg-pink-100 px-2 py-0.5 text-xs font-mono text-pink-700 font-bold tracking-wider">
                            {coupon.code}
                          </code>
                          <span className="text-xs font-medium text-pink-600">{coupon.discount}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {daysLeft > 0
                            ? locale === "zh" ? `${daysLeft} 天后过期` : `${daysLeft}d left`
                            : locale === "zh" ? "即将过期" : "Expiring"}
                        </div>
                        <Badge className="mt-1 bg-green-100 text-green-700 text-xs">
                          {locale === "zh" ? "点击复制" : "Tap to copy"}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 会员信息 */}
        {membership && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-yellow-500" />
                {locale === "zh" ? "我的会员" : "My Membership"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-gradient-to-br from-yellow-50 to-orange-50 border">
                  <div className="text-sm text-muted-foreground">{locale === "zh" ? "当前等级" : "Current Tier"}</div>
                  <div className="text-xl font-bold flex items-center gap-2 mt-1">
                    <Crown className="h-5 w-5" style={{ color: membership.tier?.badge_color || "#999" }} />
                    {membership.tier?.name || (locale === "zh" ? "普通会员" : "Member")}
                  </div>
                  {parseFloat(membership.tier?.discount_percent || "0") > 0 && (
                    <Badge className="mt-2 bg-green-100 text-green-700">
                      {locale === "zh" ? `订单 ${membership.tier?.discount_percent}% 折扣` : `${membership.tier?.discount_percent}% off`}
                    </Badge>
                  )}
                </div>
                <div className="p-4 rounded-lg border">
                  <div className="text-sm text-muted-foreground">{locale === "zh" ? "累计消费" : "Total Spent"}</div>
                  <div className="text-xl font-bold mt-1">${parseFloat(membership.total_spent || "0").toFixed(2)}</div>
                </div>
                <div className="p-4 rounded-lg border">
                  <div className="text-sm text-muted-foreground">{locale === "zh" ? "累计订单" : "Total Orders"}</div>
                  <div className="text-xl font-bold mt-1">{membership.total_orders}</div>
                </div>
                <div className="p-4 rounded-lg border">
                  <div className="text-sm text-muted-foreground">{locale === "zh" ? "加入时间" : "Member Since"}</div>
                  <div className="text-xl font-bold mt-1 text-sm">{new Date(membership.joined_at).toLocaleDateString()}</div>
                </div>
              </div>
              {membership.tier?.benefits && (
                <div className="mt-3 p-4 rounded-lg border bg-blue-50">
                  <div className="text-sm font-semibold mb-1">{locale === "zh" ? "会员权益" : "Benefits"}</div>
                  <div className="text-sm text-muted-foreground">{membership.tier.benefits}</div>
                </div>
              )}
              {wallet && wallet.balance > 0 && (
                <div className="mt-3 p-4 rounded-lg border bg-amber-50 border-amber-200">
                  <div className="text-sm font-semibold mb-1 flex items-center gap-1">
                    <Wallet className="h-4 w-4 text-amber-600" />
                    {locale === "zh" ? "钱包抵扣提示" : "Wallet Tip"}
                  </div>
                  <div className="text-sm text-amber-700">
                    {locale === "zh"
                      ? `您有 $${wallet.balance.toFixed(2)} 余额可用于本次支付，结账时自动抵扣`
                      : `You have $${wallet.balance.toFixed(2)} balance available for checkout`}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 地址管理 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> 收货地址</CardTitle>
              <Dialog open={addrOpen} onOpenChange={setAddrOpen}>
                <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" /> 添加地址</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>添加地址</DialogTitle></DialogHeader>
                  <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>标签（如：家/公司）</Label><Input value={addrForm.label} onChange={(e) => setAddrForm({ ...addrForm, label: e.target.value })} /></div>
                      <div><Label>电话</Label><Input value={addrForm.phone} onChange={(e) => setAddrForm({ ...addrForm, phone: e.target.value })} /></div>
                    </div>
                    <div><Label>地址行1</Label><Input value={addrForm.address_line1} onChange={(e) => setAddrForm({ ...addrForm, address_line1: e.target.value })} /></div>
                    <div><Label>地址行2（可选）</Label><Input value={addrForm.address_line2} onChange={(e) => setAddrForm({ ...addrForm, address_line2: e.target.value })} /></div>
                    <div className="grid grid-cols-3 gap-2">
                      <div><Label>城市</Label><Input value={addrForm.city} onChange={(e) => setAddrForm({ ...addrForm, city: e.target.value })} /></div>
                      <div><Label>州/省</Label><Input value={addrForm.state} onChange={(e) => setAddrForm({ ...addrForm, state: e.target.value })} /></div>
                      <div><Label>邮编</Label><Input value={addrForm.zip} onChange={(e) => setAddrForm({ ...addrForm, zip: e.target.value })} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>国家</Label><Input value={addrForm.country} onChange={(e) => setAddrForm({ ...addrForm, country: e.target.value })} /></div>
                      <div className="flex items-end pb-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={addrForm.is_default} onChange={(e) => setAddrForm({ ...addrForm, is_default: e.target.checked })} />
                          设为默认地址
                        </label>
                      </div>
                    </div>
                    <Button onClick={saveAddress} className="w-full">保存地址</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {addresses.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无地址</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {addresses.map((addr) => (
                  <div key={addr.id} className={`p-4 rounded-lg border ${addr.is_default ? "border-blue-300 bg-blue-50" : ""}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        {addr.label && <span className="text-xs font-semibold text-muted-foreground uppercase">{addr.label}</span>}
                        {addr.is_default && <Badge className="ml-2 text-xs bg-blue-100 text-blue-700">默认</Badge>}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => deleteAddress(addr.id)}><Trash className="h-3 w-3 text-red-500" /></Button>
                    </div>
                    <p className="text-sm mt-1">{addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ""}</p>
                    <p className="text-sm text-muted-foreground">{addr.city}{addr.state ? `, ${addr.state}` : ""} {addr.zip}</p>
                    <p className="text-sm text-muted-foreground">{addr.country}</p>
                    {addr.phone && <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1"><Phone className="h-3 w-3" /> {addr.phone}</p>}
                    {!addr.is_default && (
                      <Button variant="link" size="sm" className="p-0 h-auto text-xs mt-1" onClick={() => setDefaultAddress(addr.id)}>设为默认</Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
