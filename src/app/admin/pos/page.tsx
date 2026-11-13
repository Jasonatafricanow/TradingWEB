"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parsePosTaxRateBps } from "@/services/admin/pos-store-config";
import type { PosCheckoutRequestV1, PosOrderDto } from "@/services/admin/pos-contracts";
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
import { useI18n } from "@/contexts/i18n-context";
import { translate } from "@/i18n";
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
  const { t, locale } = useI18n();
  const [operatorId, setOperatorId] = useState("");
  const [pin, setPin] = useState("");
  const [operatorToken, setOperatorToken] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [bootstrap, setBootstrap] = useState<{ currency: string; tax_rate: string; pricing_version: string; payment_methods: Array<{ code: string; label: string }> } | null>(null);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [cashCount, setCashCount] = useState("0.00");
  const [managerId, setManagerId] = useState("");
  const [managerPin, setManagerPin] = useState("");
  const [approvalHash, setApprovalHash] = useState<string | null>(null);
  const pendingRequest = useRef<PosCheckoutRequestV1 | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  useEffect(() => {
    let id = localStorage.getItem("pos_device_id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("pos_device_id", id); }
    setDeviceId(id);
  }, []);
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

  useEffect(() => {
    setOperatorToken(""); setBootstrap(null); setShiftId(null); setApprovalHash(null); pendingRequest.current = null;
    setCart([]); setResults([]);
    if (!storeId) return;
    let current = true;
    apiFetch(`/api/admin/pos/bootstrap?store_id=${encodeURIComponent(storeId)}`).then(async response => {
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message || "门店配置加载失败");
      if (current) { setBootstrap(json.data); setPaymentMethod(json.data.payment_methods[0]?.code || "cash"); }
    }).catch(error => { if (current) toast.error(error.message); });
    return () => { current = false; };
  }, [storeId]);

  const posHeaders = (token = operatorToken) => ({ "X-POS-Operator-Session": token, "X-POS-Device-ID": deviceId });
  const apiData = async (path: string, body?: unknown, token = operatorToken) => {
    const response = await apiFetch(path, { method: body ? "POST" : "GET", headers: posHeaders(token), ...(body ? { body: JSON.stringify(body) } : {}) });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message || json.error || "请求失败");
    return json.data;
  };
  const startOperator = async () => {
    if (sessionBusy) return;
    setSessionBusy(true);
    try {
      const session = await apiData("/api/admin/pos/operator-sessions", { staff_id: operatorId.trim(), store_id: storeId, device_id: deviceId, pin });
      setOperatorId(session.operator.staffId); setOperatorToken(session.token);
      const shift = await apiData("/api/admin/pos/shifts/current", undefined, session.token);
      setShiftId(shift?.id || null); toast.success(t("pos.operator_verified"));
    } catch (error) { toast.error(error instanceof Error ? error.message : t("pos.login_failed")); }
    finally { setPin(""); setSessionBusy(false); }
  };
  const changeShift = async () => {
    if (sessionBusy) return;
    if (!/^\d+(\.\d{1,2})?$/.test(cashCount)) { toast.error(t("pos.invalid_cash")); return; }
    setSessionBusy(true);
    try {
      if (shiftId) {
        const closed = await apiData(`/api/admin/pos/shifts/${shiftId}/close`, { counted_cash: Number(cashCount).toFixed(2), idempotency_key: `web-close-${shiftId}` });
        toast.success(translate(locale, "pos.shift_closed", { difference: closed.difference_cash })); setShiftId(null);
      } else {
        const opened = await apiData("/api/admin/pos/shifts", { opening_float: Number(cashCount).toFixed(2) });
        setShiftId(opened.id); toast.success(t("pos.shift_opened"));
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : t("pos.shift_failed")); }
    finally { setSessionBusy(false); }
  };

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

  const subtotal = cart.reduce((s, l) => s + Math.round(l.price * 100) * l.quantity, 0) / 100;
  const discountNum = Math.max(0, Number(discount) || 0);
  const tax = Math.round(Math.max(0, Math.round(subtotal * 100) - Math.round(discountNum * 100)) * parsePosTaxRateBps(bootstrap?.tax_rate) / 10000) / 100;
  const total = Math.max(0, subtotal - discountNum) + tax;

  const submitCheckout = async (request: PosCheckoutRequestV1) => {
    const res = await apiFetch("/api/admin/pos/checkout", { method: "POST", headers: posHeaders(), body: JSON.stringify(request) });
    const json = await res.json();
    if (!res.ok) {
      if (json.error?.code === "DISCOUNT_APPROVAL_REQUIRED") { setApprovalHash(json.error.details.resource_hash); return; }
      throw new Error(json.error?.message || "结账失败，请核对服务端报价和支付金额");
    }
    const order = json.data as PosOrderDto;
    setReceipt({ order_no: order.order_no, created_at: order.created_at, store: { id: storeId, name: stores.find(store => store.id === storeId)?.name || storeId },
      items: order.items.map(item => ({ title: item.name, sku: item.sku, quantity: item.quantity, unit_price: item.unit_price, subtotal: (Number(item.unit_price) * item.quantity).toFixed(2) })),
      subtotal: order.subtotal, discount_amount: order.discount_total, total_amount: order.total, currency: request.currency, payment_method: request.payments[0].label, customer_phone: null });
    pendingRequest.current = null; setApprovalHash(null); setCart([]); setCustomerPhone(""); setDiscount("");
    toast.success(`订单 ${order.order_no} 已完成`);
  };
  const doCheckout = async () => {
    if (checkingOut) return;
    if (!operatorToken || !bootstrap || !shiftId) { toast.error(t("pos.verify_and_open_first")); return; }
    if (!cart.length || total <= 0 || discountNum > subtotal) { toast.error(t("pos.check_cart_total")); return; }
    setCheckingOut(true);
    try {
      const payload = { store_id: storeId, staff_id: operatorId, customer_id: null, currency: bootstrap.currency, note: null,
        fulfillment: { method: "in_store" as const }, items: cart.map(line => ({ product_id: line.product_id, variant_id: line.variant_id, quantity: line.quantity, line_discount: "0.00" })),
        order_discount: discountNum.toFixed(2), pricing_preview: { subtotal: subtotal.toFixed(2), discount: discountNum.toFixed(2), tax: tax.toFixed(2), total: total.toFixed(2) }, pricing_version: bootstrap.pricing_version,
        payments: [{ method: paymentMethod, label: bootstrap.payment_methods.find(method => method.code === paymentMethod)?.label || paymentMethod, amount: total.toFixed(2), reference: null }] };
      if (pendingRequest.current) {
        const { idempotency_key: _key, approval_token: _token, ...previous } = pendingRequest.current;
        if (JSON.stringify(previous) !== JSON.stringify(payload)) pendingRequest.current = null;
      }
      pendingRequest.current ??= { ...payload, idempotency_key: crypto.randomUUID() };
      await submitCheckout(pendingRequest.current);
    } catch (error) { toast.error(error instanceof Error ? error.message : "结账失败"); }
    finally { setCheckingOut(false); }
  };
  const approveDiscount = async () => {
    if (!pendingRequest.current || !approvalHash || checkingOut) return;
    setCheckingOut(true);
    try {
      const manager = await apiData("/api/admin/pos/operator-sessions", { staff_id: managerId.trim(), store_id: storeId, device_id: deviceId, pin: managerPin });
      const approval = await apiData("/api/admin/pos/approvals", { store_id: storeId, operation: "checkout_discount", resource_hash: approvalHash }, manager.token);
      await submitCheckout({ ...pendingRequest.current, approval_token: approval.token });
    } catch (error) { toast.error(error instanceof Error ? error.message : t("pos.approval_failed")); }
    finally { setManagerPin(""); setCheckingOut(false); }
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
              disabled={checkingOut || sessionBusy}
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

      <Card className="mb-4"><CardContent className="pt-4 space-y-3">
        {!operatorToken ? <div className="flex gap-2">
          <Input placeholder={t("pos.operator_staff_id")} value={operatorId} onChange={e => setOperatorId(e.target.value)} />
          <Input placeholder={t("pos.operator_pin")} type="password" value={pin} onChange={e => setPin(e.target.value)} autoComplete="off" />
          <Button disabled={!storeId || !bootstrap || sessionBusy} onClick={startOperator}>{t("pos.verify_operator")}</Button>
        </div> : <div className="flex items-center gap-2">
          <span className="text-sm">{t("pos.operator_label")} {operatorId} · {shiftId ? t("pos.shift_status_open") : t("pos.shift_status_closed")}</span>
          <Input className="w-40" aria-label={shiftId ? t("pos.closing_cash") : t("pos.opening_float")} value={cashCount} onChange={e => setCashCount(e.target.value)} />
          <Button disabled={sessionBusy || checkingOut} onClick={changeShift}>{shiftId ? t("pos.close_shift") : t("pos.open_shift")}</Button>
          <Button variant="outline" onClick={() => setOperatorToken("")}>{t("pos.switch_operator")}</Button>
        </div>}
        {approvalHash && <div className="space-y-2">
          <p className="text-sm">{t("pos.discount_needs_approval")}</p>
          <Input placeholder={t("pos.manager_staff_id")} value={managerId} onChange={e => setManagerId(e.target.value)} />
          <Input placeholder={t("pos.manager_pin")} type="password" value={managerPin} onChange={e => setManagerPin(e.target.value)} autoComplete="off" />
          <Button disabled={checkingOut} onClick={approveDiscount}>{t("pos.approve_and_complete")}</Button>
          <Button variant="outline" disabled={checkingOut} onClick={() => setApprovalHash(null)}>{t("pos.cancel_approval")}</Button>
        </div>}
      </CardContent></Card>
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
              {(bootstrap?.payment_methods || []).map(({code, label}) => (
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
              <div className="flex justify-between text-gray-500"><span>{t("pos.tax")}</span><span>{tax.toFixed(2)} {bootstrap?.currency}</span></div>
              <div className="flex justify-between font-bold text-lg"><span>应收</span><span>${total.toFixed(2)}</span></div>
            </div>

            <Button
              className="w-full py-6 text-lg"
              disabled={checkingOut || cart.length === 0 || !operatorToken || !shiftId || Boolean(approvalHash)}
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
