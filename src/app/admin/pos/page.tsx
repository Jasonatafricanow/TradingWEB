"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/client-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { PageHeader } from "../_components";
import { MagnifyingGlass, Minus, Plus, Printer, Storefront, Trash } from "@phosphor-icons/react";

interface StoreOption { id: string; name: string; status: string }

interface CatalogItem {
  product_id: string;
  variant_id: string | null;
  title: string;
  variant_title: string | null;
  sku: string | null;
  barcode: string | null;
  price: number;
  type: string;
  stock: number;
}

interface CartLine extends CatalogItem { quantity: number }

interface Receipt {
  order_no: string;
  created_at: string;
  store: { id: string; name: string };
  items: { title: string; sku: string | null; quantity: number; unit_price: string; subtotal: string }[];
  subtotal: string;
  discount_amount: string;
  total_amount: string;
  currency: string;
  payment_method: string;
  customer_phone: string | null;
}

const PAYMENT_LABELS: Record<string, string> = { cash: "现金", card: "刷卡", transfer: "转账" };

function lineKey(item: { product_id: string; variant_id: string | null }) {
  return item.variant_id ? `${item.product_id}::${item.variant_id}` : item.product_id;
}

export default function PosPage() {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerPhone, setCustomerPhone] = useState("");
  const [discount, setDiscount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [checkingOut, setCheckingOut] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    apiFetch("/api/admin/stores")
      .then((r) => r.json())
      .then((j) => {
        const active = (j.data || []).filter((s: StoreOption) => s.status === "active");
        setStores(active);
        const saved = localStorage.getItem("pos_store_id");
        if (saved && active.some((s: StoreOption) => s.id === saved)) setStoreId(saved);
        else if (active.length === 1) setStoreId(active[0].id);
      })
      .catch(() => toast.error("门店列表加载失败"));
  }, []);

  const runSearch = useCallback(async (q: string, sid: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const params = new URLSearchParams({ q: q.trim() });
      if (sid) params.set("store_id", sid);
      const res = await apiFetch(`/api/admin/pos/catalog?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || "搜索失败");
      setResults(json.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "搜索失败");
    } finally {
      setSearching(false);
    }
  }, []);

  const onQueryChange = (v: string) => {
    setQuery(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(v, storeId), 300);
  };

  const addToCart = (item: CatalogItem) => {
    if (item.type === "physical" && item.stock <= 0) {
      toast.error("该商品无库存");
      return;
    }
    setCart((prev) => {
      const key = lineKey(item);
      const existing = prev.find((l) => lineKey(l) === key);
      if (existing) {
        return prev.map((l) => (lineKey(l) === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const changeQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (lineKey(l) === key ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    );
  };

  const subtotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  const discountNum = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal - discountNum);

  const doCheckout = async () => {
    if (!storeId) { toast.error("请先选择门店"); return; }
    if (cart.length === 0) { toast.error("购物车为空"); return; }
    if (discountNum > subtotal) { toast.error("折扣不能超过小计"); return; }
    setCheckingOut(true);
    try {
      const res = await apiFetch("/api/admin/pos/checkout", {
        method: "POST",
        body: JSON.stringify({
          store_id: storeId,
          items: cart.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, quantity: l.quantity })),
          payment_method: paymentMethod,
          customer_phone: customerPhone.trim() || undefined,
          discount_amount: discountNum || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || "结账失败");
      setReceipt(json.data);
      setCart([]);
      setCustomerPhone("");
      setDiscount("");
      toast.success(`订单 ${json.data.order_no} 已完成`);
    } catch (err) {
      // 强一致:后端已整体回滚,这里只报错,不产生半成品订单
      toast.error(err instanceof Error ? err.message : "结账失败");
    } finally {
      setCheckingOut(false);
    }
  };

  // ── 小票视图 ──
  if (receipt) {
    return (
      <>
        <style>{`@media print { body * { visibility: hidden; } #pos-receipt, #pos-receipt * { visibility: visible; } #pos-receipt { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
        <div className="max-w-sm mx-auto">
          <div id="pos-receipt" className="bg-white border rounded-lg p-6 font-mono text-sm">
            <div className="text-center mb-4">
              <p className="font-bold text-base">{receipt.store.name}</p>
              <p className="text-xs text-gray-500">{new Date(receipt.created_at).toLocaleString("zh-CN")}</p>
              <p className="text-xs text-gray-500">单号 {receipt.order_no}</p>
            </div>
            <Separator className="my-2" />
            {receipt.items.map((it, i) => (
              <div key={i} className="flex justify-between gap-2 py-1">
                <span className="flex-1">
                  {it.title}
                  {it.sku && <span className="text-gray-400 text-xs"> [{it.sku}]</span>}
                  <span className="text-gray-500"> x{it.quantity}</span>
                </span>
                <span>${it.subtotal}</span>
              </div>
            ))}
            <Separator className="my-2" />
            <div className="flex justify-between"><span>小计</span><span>${receipt.subtotal}</span></div>
            {Number(receipt.discount_amount) > 0 && (
              <div className="flex justify-between text-gray-500"><span>折扣</span><span>-${receipt.discount_amount}</span></div>
            )}
            <div className="flex justify-between font-bold text-base mt-1">
              <span>合计</span><span>${receipt.total_amount}</span>
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span>收款方式</span><span>{PAYMENT_LABELS[receipt.payment_method] || receipt.payment_method}</span>
            </div>
            {receipt.customer_phone && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>客户</span><span>{receipt.customer_phone}</span>
              </div>
            )}
            <p className="text-center text-xs text-gray-400 mt-4">谢谢惠顾</p>
          </div>
          <div className="flex gap-2 mt-4">
            <Button className="flex-1" variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" /> 打印小票
            </Button>
            <Button className="flex-1" onClick={() => setReceipt(null)}>
              新交易
            </Button>
          </div>
        </div>
      </>
    );
  }

  // ── 收银视图 ──
  return (
    <>
      <PageHeader
        title="POS 收银"
        description="搜索商品加入购物车,选择收款方式完成销售"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/admin/pos/report" className="text-sm text-blue-600 hover:underline shrink-0">日结报表</Link>
            <Storefront className="h-4 w-4 text-gray-500" />
            <Select
              value={storeId || "__none__"}
              onValueChange={(v) => {
                const sid = v === "__none__" ? "" : v;
                setStoreId(sid);
                if (sid) localStorage.setItem("pos_store_id", sid);
              }}
            >
              <SelectTrigger className="w-44"><SelectValue placeholder="选择门店" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">选择门店</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左:搜索 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MagnifyingGlass className="h-4 w-4" /> 商品搜索
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="商品名称 / SKU / 扫码输入"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              autoFocus
            />
            <div className="max-h-[28rem] overflow-y-auto divide-y">
              {searching && <p className="text-sm text-gray-400 py-3">搜索中...</p>}
              {!searching && query.trim() && results.length === 0 && (
                <p className="text-sm text-gray-400 py-3">无匹配商品</p>
              )}
              {results.map((item) => (
                <button
                  key={lineKey(item)}
                  className="w-full flex items-center justify-between gap-2 py-2 px-1 text-left hover:bg-gray-50"
                  onClick={() => addToCart(item)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.title}
                      {item.variant_title && <span className="text-gray-500"> · {item.variant_title}</span>}
                    </p>
                    <p className="text-xs text-gray-400">
                      {item.sku ? `SKU ${item.sku} · ` : ""}
                      {item.type === "physical" ? `库存 ${item.stock}` : "无需库存"}
                    </p>
                  </div>
                  <span className="font-mono text-sm shrink-0">${item.price.toFixed(2)}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 右:购物车 + 结账 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">购物车 ({cart.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cart.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">点击左侧商品加入购物车</p>}
            {cart.map((l) => {
              const key = lineKey(l);
              return (
                <div key={key} className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">
                      {l.title}
                      {l.variant_title && <span className="text-gray-500"> · {l.variant_title}</span>}
                    </p>
                    <p className="text-xs text-gray-400 font-mono">${l.price.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => changeQty(key, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm">{l.quantity}</span>
                    <Button
                      variant="outline" size="icon" className="h-7 w-7"
                      disabled={l.type === "physical" && l.quantity >= l.stock}
                      onClick={() => changeQty(key, 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => changeQty(key, -l.quantity)}>
                      <Trash className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="font-mono text-sm w-20 text-right shrink-0">
                    ${(l.price * l.quantity).toFixed(2)}
                  </span>
                </div>
              );
            })}

            <Separator />

            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="客户手机号(选填)"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
              <Input
                type="number"
                min="0"
                placeholder="整单折扣金额"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              {Object.entries(PAYMENT_LABELS).map(([code, label]) => (
                <Button
                  key={code}
                  variant={paymentMethod === code ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setPaymentMethod(code)}
                >
                  {label}
                </Button>
              ))}
            </div>

            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-gray-500"><span>小计</span><span>${subtotal.toFixed(2)}</span></div>
              {discountNum > 0 && (
                <div className="flex justify-between text-gray-500"><span>折扣</span><span>-${discountNum.toFixed(2)}</span></div>
              )}
              <div className="flex justify-between font-bold text-lg"><span>应收</span><span>${total.toFixed(2)}</span></div>
            </div>

            <Button
              className="w-full py-6 text-lg"
              disabled={checkingOut || cart.length === 0 || !storeId}
              onClick={doCheckout}
            >
              {checkingOut ? "结账中..." : `收款 $${total.toFixed(2)}`}
            </Button>
            {!storeId && <Badge variant="outline" className="w-full justify-center text-yellow-600">请先在右上角选择门店</Badge>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
