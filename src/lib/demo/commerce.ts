/**
 * 演示模式交易数据 —— 订单、会员、优惠券、配送区、分销与后台统计。
 * 进程内内存存储：下单 / 取消 / 退款 / 地址增删改都会真实生效并在刷新后保持，
 * 服务重启则回到初始种子，便于反复演示。
 */
import { DEMO_PRODUCTS, demoProduct, demoVariants } from "./catalog";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();

export const DEMO_USER_ID = "demo-user-001";
export const DEMO_USER_EMAIL = "demo@example.com";
export const DEMO_USER_NAME = "Alex Chen";

export interface DemoOrderItem {
  id: string;
  product_id: string;
  variant_id: string | null;
  product_title: string;
  product_type: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
  sku: string | null;
  delivery_method: string | null;
  image_key: string | null;
}

export interface DemoOrder {
  id: string;
  order_no: string;
  user_id: string;
  buyer_email: string;
  buyer_name: string;
  buyer_phone: string | null;
  total_amount: string;
  subtotal: string;
  discount_amount: string;
  shipping_cost: string;
  currency: string;
  status: string;
  payment_method: string;
  payment_status: string;
  financial_status: string;
  coupon_code: string | null;
  source: string;
  has_refund: boolean;
  created_at: string;
  paid_at: string | null;
  order_items: DemoOrderItem[];
  timeline: { id: string; action: string; description: string; created_at: string }[];
}

export interface DemoAddress {
  id: string;
  user_id: string;
  label: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  is_default: boolean;
  created_at: string;
}

export interface DemoCoupon {
  id: string;
  code: string;
  description: string;
  discount: string;
  type: "percent" | "fixed";
  min_amount: string;
  expires_at: string;
  is_used: boolean;
}

export interface DemoDeliveryZone {
  id: string;
  name: string;
  name_en: string;
  base_rate: string;
  free_shipping_min: string;
  time_slots: { label: string; label_en: string }[];
}

export interface DemoPaymentMethod {
  code: string;
  name: string;
  name_en: string;
}

// ─── 静态种子 ────────────────────────────────────────────────────────────────

export const DEMO_PAYMENT_METHODS: DemoPaymentMethod[] = [
  { code: "paypal", name: "PayPal", name_en: "PayPal" },
  { code: "stripe", name: "信用卡 / 借记卡", name_en: "Credit / Debit Card" },
  { code: "bank_transfer", name: "银行转账（线下）", name_en: "Bank Transfer (Offline)" },
  { code: "cod", name: "货到付款", name_en: "Cash on Delivery" },
];

export const DEMO_DELIVERY_ZONES: DemoDeliveryZone[] = [
  {
    id: "zone-apac", name: "亚太区", name_en: "Asia Pacific", base_rate: "18.00", free_shipping_min: "300.00",
    time_slots: [{ label: "工作日 09:00-18:00", label_en: "Weekdays 09:00-18:00" }, { label: "不限时间", label_en: "Any time" }],
  },
  {
    id: "zone-eu", name: "欧洲区", name_en: "Europe", base_rate: "32.00", free_shipping_min: "500.00",
    time_slots: [{ label: "工作日 10:00-17:00", label_en: "Weekdays 10:00-17:00" }, { label: "不限时间", label_en: "Any time" }],
  },
  {
    id: "zone-na", name: "北美区", name_en: "North America", base_rate: "28.00", free_shipping_min: "450.00",
    time_slots: [{ label: "工作日 09:00-17:00", label_en: "Weekdays 09:00-17:00" }, { label: "周末配送", label_en: "Weekend delivery" }],
  },
  {
    id: "zone-latam", name: "拉美区", name_en: "Latin America", base_rate: "36.00", free_shipping_min: "600.00",
    time_slots: [{ label: "不限时间", label_en: "Any time" }],
  },
];

export const DEMO_COUPONS: DemoCoupon[] = [
  { id: "cp-1", code: "WELCOME10", description: "新客首单 9 折", discount: "10", type: "percent", min_amount: "50.00", expires_at: daysAgo(-60), is_used: false },
  { id: "cp-2", code: "VIP500", description: "会员专享满 1000 减 500", discount: "500", type: "fixed", min_amount: "1000.00", expires_at: daysAgo(-30), is_used: false },
  { id: "cp-3", code: "FREESHIP", description: "运费全免（下单时自动抵扣运费）", discount: "36", type: "fixed", min_amount: "100.00", expires_at: daysAgo(-45), is_used: false },
  { id: "cp-4", code: "TRADE25", description: "工业硬件专享减 25", discount: "25", type: "fixed", min_amount: "200.00", expires_at: daysAgo(-14), is_used: false },
];

export const DEMO_TIERS = [
  { id: "tier-1", name: "普通会员", name_en: "Member", level: 1, min_spent: "0.00", discount_percent: "0.00", badge_color: "#64748b", benefits: "标准客服支持" },
  { id: "tier-2", name: "白银会员", name_en: "Silver", level: 2, min_spent: "500.00", discount_percent: "3.00", badge_color: "#94a3b8", benefits: "3% 折扣 · 优先客服" },
  { id: "tier-3", name: "黄金会员", name_en: "Gold", level: 3, min_spent: "2000.00", discount_percent: "5.00", badge_color: "#d97706", benefits: "5% 折扣 · 专属顾问 · 免运费额度" },
  { id: "tier-4", name: "铂金会员", name_en: "Platinum", level: 4, min_spent: "8000.00", discount_percent: "8.00", badge_color: "#0ea5e9", benefits: "8% 折扣 · 季度策略复盘 · 优先备货" },
];

const INITIAL_ADDRESSES: DemoAddress[] = [
  {
    id: "addr-1", user_id: DEMO_USER_ID, label: "公司总部", phone: "+86 138 0013 8000",
    address_line1: "上海市浦东新区世纪大道 100 号 环球金融中心 28 层", address_line2: "收件人：采购部",
    city: "上海", state: "上海市", zip: "200120", country: "CN", is_default: true, created_at: daysAgo(120),
  },
  {
    id: "addr-2", user_id: DEMO_USER_ID, label: "欧洲海外仓", phone: "+49 30 1234 5678",
    address_line1: "Lagerstraße 14, Halle B", address_line2: "Tor 3",
    city: "Hamburg", state: "Hamburg", zip: "20457", country: "DE", is_default: false, created_at: daysAgo(64),
  },
];

function seedOrder(opts: {
  id: string; no: string; age: number; status: string; payment: string;
  paymentStatus: string; financial: string; items: { pid: string; qty: number; vid?: string }[];
  coupon?: string; discount?: string; shipping?: string; zone?: string; refund?: boolean;
}): DemoOrder {
  const items: DemoOrderItem[] = opts.items.map((it, i) => {
    const p = demoProduct(it.pid)!;
    const v = it.vid ? demoVariants(it.pid).find((x) => x.id === it.vid) : undefined;
    const unit = v ? v.price : p.price;
    return {
      id: `${opts.id}-item-${i + 1}`,
      product_id: p.id,
      variant_id: v?.id ?? null,
      product_title: v ? `${p.title} · ${v.title}` : p.title,
      product_type: p.type,
      quantity: it.qty,
      unit_price: unit,
      subtotal: (Number(unit) * it.qty).toFixed(2),
      sku: v?.sku ?? null,
      delivery_method: p.delivery_method,
      image_key: p.image_key,
    };
  });
  const subtotal = items.reduce((s, i) => s + Number(i.subtotal), 0);
  const discount = Number(opts.discount ?? "0");
  const shipping = Number(opts.shipping ?? "0");
  const paid = opts.paymentStatus === "paid";
  return {
    id: opts.id,
    order_no: opts.no,
    user_id: DEMO_USER_ID,
    buyer_email: DEMO_USER_EMAIL,
    buyer_name: DEMO_USER_NAME,
    buyer_phone: "+86 138 0013 8000",
    subtotal: subtotal.toFixed(2),
    discount_amount: discount.toFixed(2),
    shipping_cost: shipping.toFixed(2),
    total_amount: Math.max(0, subtotal - discount + shipping).toFixed(2),
    currency: "USD",
    status: opts.status,
    payment_method: opts.payment,
    payment_status: opts.paymentStatus,
    financial_status: opts.financial,
    coupon_code: opts.coupon ?? null,
    source: opts.zone ?? "web",
    has_refund: opts.refund ?? false,
    created_at: daysAgo(opts.age),
    paid_at: paid ? daysAgo(opts.age) : null,
    order_items: items,
    timeline: [
      { id: `${opts.id}-t1`, action: "created", description: "订单已创建", created_at: daysAgo(opts.age) },
      ...(paid ? [{ id: `${opts.id}-t2`, action: "paid", description: `支付成功（${opts.payment}）`, created_at: daysAgo(opts.age) }] : []),
      ...(opts.status === "completed" ? [{ id: `${opts.id}-t3`, action: "completed", description: "订单已完成交付", created_at: daysAgo(Math.max(0, opts.age - 4)) }] : []),
      ...(opts.status === "processing" ? [{ id: `${opts.id}-t3`, action: "processing", description: "备货中，预计 2 个工作日内发出", created_at: hoursAgo(20) }] : []),
      ...(opts.status === "cancelled" ? [{ id: `${opts.id}-t3`, action: "cancelled", description: "买家主动取消", created_at: daysAgo(Math.max(0, opts.age - 1)) }] : []),
      ...(opts.refund ? [{ id: `${opts.id}-t4`, action: "refunded", description: "退款已原路退回", created_at: daysAgo(Math.max(0, opts.age - 6)) }] : []),
    ],
  };
}

const INITIAL_ORDERS: DemoOrder[] = [
  seedOrder({ id: "ord-1001", no: "ORD20260918A7K2", age: 55, status: "completed", payment: "paypal", paymentStatus: "paid", financial: "paid", items: [{ pid: "prod-12", qty: 1 }, { pid: "prod-10", qty: 1 }] }),
  seedOrder({ id: "ord-1002", no: "ORD20261002B3M9", age: 41, status: "completed", payment: "stripe", paymentStatus: "paid", financial: "paid", items: [{ pid: "prod-20", qty: 1, vid: "var-20-b" }], shipping: "18.00", zone: "zone-apac" }),
  seedOrder({ id: "ord-1003", no: "ORD20261015C8Q4", age: 28, status: "refunded", payment: "stripe", paymentStatus: "refunded", financial: "refunded", items: [{ pid: "prod-25", qty: 2 }], shipping: "18.00", refund: true }),
  seedOrder({ id: "ord-1004", no: "ORD20261029D1R7", age: 14, status: "completed", payment: "paypal", paymentStatus: "paid", financial: "paid", items: [{ pid: "prod-1", qty: 1 }, { pid: "prod-5", qty: 1 }], coupon: "WELCOME10", discount: "71.90" }),
  seedOrder({ id: "ord-1005", no: "ORD20261105E5T3", age: 7, status: "processing", payment: "stripe", paymentStatus: "paid", financial: "paid", items: [{ pid: "prod-21", qty: 1, vid: "var-21-a" }, { pid: "prod-24", qty: 1, vid: "var-24-b" }], shipping: "18.00", zone: "zone-apac" }),
  seedOrder({ id: "ord-1006", no: "ORD20261109F2V8", age: 3, status: "paid", payment: "paypal", paymentStatus: "paid", financial: "paid", items: [{ pid: "prod-3", qty: 1 }] }),
  seedOrder({ id: "ord-1007", no: "ORD20261111G9W1", age: 1, status: "pending", payment: "bank_transfer", paymentStatus: "unpaid", financial: "unpaid", items: [{ pid: "prod-30", qty: 1 }], shipping: "36.00", zone: "zone-latam" }),
  seedOrder({ id: "ord-1008", no: "ORD20261020H4X6", age: 23, status: "cancelled", payment: "cod", paymentStatus: "unpaid", financial: "unpaid", items: [{ pid: "prod-22", qty: 1, vid: "var-22-a" }] }),
];

// ─── 进程内存储 ──────────────────────────────────────────────────────────────

interface DemoStore {
  orders: DemoOrder[];
  addresses: DemoAddress[];
  coupons: DemoCoupon[];
  wallet: { balance: number; currency: string; updated_at: string };
  affiliate: {
    code: string; nickname: string; status: string; total_earned: string; balance: string;
    joined_at: string;
  };
  referrals: { order_id: string; order_no: string; commission: string; rate: string; status: string; created_at: string }[];
  notifications: { id: string; title: string; body: string; type: string; is_read: boolean; created_at: string }[];
  wishlist: string[];
  seq: number;
}

const globalKey = "__globaltradeDemoStore";
type GlobalWithStore = typeof globalThis & { [globalKey]?: DemoStore };

function seedStore(): DemoStore {
  return {
    orders: INITIAL_ORDERS.map((o) => ({ ...o, order_items: [...o.order_items], timeline: [...o.timeline] })),
    addresses: INITIAL_ADDRESSES.map((a) => ({ ...a })),
    coupons: DEMO_COUPONS.map((c) => ({ ...c })),
    wallet: { balance: 250, currency: "USD", updated_at: daysAgo(2) },
    affiliate: {
      code: "ALEXTRADE", nickname: "Alex Chen", status: "active",
      total_earned: "1284.60", balance: "420.30", joined_at: daysAgo(150),
    },
    referrals: [
      { order_id: "ord-1002", order_no: "ORD20261002B3M9", commission: "149.90", rate: "10", status: "settled", created_at: daysAgo(41) },
      { order_id: "ord-1004", order_no: "ORD20261029D1R7", commission: "64.71", rate: "10", status: "settled", created_at: daysAgo(14) },
      { order_id: "ord-1005", order_no: "ORD20261105E5T3", commission: "38.80", rate: "10", status: "pending", created_at: daysAgo(7) },
      { order_id: "ord-1006", order_no: "ORD20261109F2V8", commission: "79.90", rate: "10", status: "pending", created_at: daysAgo(3) },
    ],
    notifications: [
      { id: "nt-1", title: "订单已发出", body: "ORD20261105E5T3 已交付承运商，预计 3 个工作日送达。", type: "order", is_read: false, created_at: hoursAgo(6) },
      { id: "nt-2", title: "专属优惠即将到期", body: "TRADE25 将在 14 天后过期，可用于工业硬件品类。", type: "promo", is_read: false, created_at: hoursAgo(30) },
      { id: "nt-3", title: "咨询报告已交付", body: "《跨境供应链优化方案》书面报告已发送至您的邮箱。", type: "service", is_read: true, created_at: daysAgo(4) },
      { id: "nt-4", title: "会员等级已升级", body: "累计消费达标，您已升级为黄金会员，享 5% 折扣。", type: "membership", is_read: true, created_at: daysAgo(12) },
    ],
    wishlist: ["prod-23", "prod-31"],
    seq: 1009,
  };
}

export function demoStore(): DemoStore {
  const g = globalThis as GlobalWithStore;
  if (!g[globalKey]) g[globalKey] = seedStore();
  return g[globalKey]!;
}

// ─── 订单 ────────────────────────────────────────────────────────────────────

export function demoListOrders(userId?: string, status?: string) {
  const { orders } = demoStore();
  let list = userId ? orders.filter((o) => o.user_id === userId) : orders;
  if (status && status !== "all") list = list.filter((o) => o.status === status);
  return [...list].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}

export function demoGetOrder(id: string) {
  const { orders } = demoStore();
  return orders.find((o) => o.id === id || o.order_no === id) ?? null;
}

export function demoCreateOrder(input: {
  user_id: string;
  items: { product_id: string; quantity: number; variant_id?: string | null; delivery_method?: string | null }[];
  buyer_email?: string; buyer_name?: string; buyer_phone?: string;
  payment_method?: string; coupon_code?: string; source?: string;
  delivery_zone_id?: string; shipping_cost?: string;
}) {
  const store = demoStore();
  if (!input.items?.length) throw new Error("Order must include at least one item");

  const offline = input.payment_method && input.payment_method !== "paypal" && input.payment_method !== "stripe";
  if (offline && !input.buyer_phone?.trim()) {
    throw new Error("Phone number is required for offline payment methods");
  }

  const items: DemoOrderItem[] = input.items.map((it, i) => {
    const p = demoProduct(it.product_id);
    if (!p) throw new Error(`Product not available: ${it.product_id}`);
    const variants = demoVariants(p.id);
    if (variants.length > 0 && !it.variant_id) {
      throw new Error(`Product "${p.title}" has variants — please select a specific variant`);
    }
    const v = it.variant_id ? variants.find((x) => x.id === it.variant_id) : undefined;
    if (it.variant_id && !v) throw new Error(`Variant not found: ${it.variant_id}`);
    const qty = Math.max(1, Math.floor(Number(it.quantity) || 1));
    const unit = v ? v.price : p.price;
    return {
      id: `oi-${store.seq}-${i + 1}`,
      product_id: p.id,
      variant_id: v?.id ?? null,
      product_title: v ? `${p.title} · ${v.title}` : p.title,
      product_type: p.type,
      quantity: qty,
      unit_price: unit,
      subtotal: (Number(unit) * qty).toFixed(2),
      sku: v?.sku ?? null,
      delivery_method: it.delivery_method || p.delivery_method,
      image_key: p.image_key,
    };
  });

  const subtotal = items.reduce((s, i) => s + Number(i.subtotal), 0);
  let discount = 0;
  let appliedCode: string | null = null;
  if (input.coupon_code) {
    const v = demoValidateCoupon(input.coupon_code, subtotal);
    if (v.valid) { discount = v.discount; appliedCode = input.coupon_code.toUpperCase(); }
  }
  const shipping = Number(input.shipping_cost ?? "0");
  const id = `ord-${store.seq}`;
  const now = new Date();
  const orderNo = `ORD${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  store.seq += 1;

  const order: DemoOrder = {
    id, order_no: orderNo,
    user_id: input.user_id,
    buyer_email: input.buyer_email || DEMO_USER_EMAIL,
    buyer_name: input.buyer_name || DEMO_USER_NAME,
    buyer_phone: input.buyer_phone || null,
    subtotal: subtotal.toFixed(2),
    discount_amount: discount.toFixed(2),
    shipping_cost: shipping.toFixed(2),
    total_amount: Math.max(0, subtotal - discount + shipping).toFixed(2),
    currency: "USD",
    status: "pending",
    payment_method: input.payment_method || "paypal",
    payment_status: "unpaid",
    financial_status: "unpaid",
    coupon_code: appliedCode,
    source: input.source || "web",
    has_refund: false,
    created_at: now.toISOString(),
    paid_at: null,
    order_items: items,
    timeline: [{ id: `${id}-t1`, action: "created", description: "订单已创建", created_at: now.toISOString() }],
  };
  store.orders.unshift(order);
  return order;
}

export function demoMarkOrderPaid(id: string) {
  const o = demoGetOrder(id);
  if (!o) return null;
  o.status = "paid";
  o.payment_status = "paid";
  o.financial_status = "paid";
  o.paid_at = new Date().toISOString();
  o.timeline.push({ id: `${o.id}-t${o.timeline.length + 1}`, action: "paid", description: `支付成功（${o.payment_method}）`, created_at: o.paid_at });
  return o;
}

export function demoUpdateOrderStatus(id: string, status: string) {
  const o = demoGetOrder(id);
  if (!o) return null;
  if (status === "cancelled" && o.status !== "pending") {
    throw new Error("Only pending orders can be cancelled");
  }
  o.status = status;
  if (status === "cancelled") {
    o.payment_status = o.payment_status === "paid" ? "refunded" : "unpaid";
    o.financial_status = o.payment_status === "refunded" ? "refunded" : "unpaid";
  }
  o.timeline.push({ id: `${o.id}-t${o.timeline.length + 1}`, action: status, description: `状态更新为 ${status}`, created_at: new Date().toISOString() });
  return o;
}

export function demoCreateRefund(orderId: string, reason: string, amount?: string) {
  const o = demoGetOrder(orderId);
  if (!o) throw new Error("Order not found");
  const value = Number(amount ?? o.total_amount);
  o.has_refund = true;
  o.status = "refunded";
  o.payment_status = "refunded";
  o.financial_status = "refunded";
  o.timeline.push({ id: `${o.id}-t${o.timeline.length + 1}`, action: "refunded", description: `退款 ${value.toFixed(2)} ${o.currency}：${reason || "买家申请"}`, created_at: new Date().toISOString() });
  const store = demoStore();
  store.wallet.balance = Number((store.wallet.balance + value).toFixed(2));
  store.wallet.updated_at = new Date().toISOString();
  return { id: `rf-${o.id}`, order_id: o.id, amount: value.toFixed(2), currency: o.currency, status: "approved", reason: reason || null, created_at: new Date().toISOString() };
}

// ─── 优惠券 ──────────────────────────────────────────────────────────────────

export function demoValidateCoupon(code: string, amount: number) {
  const c = demoStore().coupons.find((x) => x.code.toUpperCase() === String(code).trim().toUpperCase());
  if (!c) return { valid: false, discount: 0, message: "优惠码无效" };
  if (c.is_used) return { valid: false, discount: 0, message: "优惠码已使用" };
  if (new Date(c.expires_at) < new Date()) return { valid: false, discount: 0, message: "优惠码已过期" };
  if (amount < Number(c.min_amount)) {
    return { valid: false, discount: 0, message: `订单需满 ${c.min_amount} 才能使用` };
  }
  const discount = c.type === "percent" ? Number(((amount * Number(c.discount)) / 100).toFixed(2)) : Number(c.discount);
  return { valid: true, discount: Math.min(discount, amount), message: c.description };
}

// ─── 会员 / 钱包 ─────────────────────────────────────────────────────────────

export function demoMembership() {
  const store = demoStore();
  const paidOrders = store.orders.filter((o) => o.payment_status === "paid");
  const totalSpent = paidOrders.reduce((s, o) => s + Number(o.total_amount), 0);
  const tier = [...DEMO_TIERS].reverse().find((t) => totalSpent >= Number(t.min_spent)) ?? DEMO_TIERS[0];
  return {
    membership: {
      total_spent: totalSpent.toFixed(2),
      total_orders: store.orders.length,
      joined_at: daysAgo(180),
      tier: {
        id: tier.id, name: tier.name, level: tier.level,
        discount_percent: tier.discount_percent, badge_color: tier.badge_color, benefits: tier.benefits,
      },
    },
    wallet: { ...store.wallet },
    coupons: store.coupons.map((c) => ({
      id: c.id, code: c.code, description: c.description,
      discount: c.type === "percent" ? `${c.discount}%` : c.discount,
      expires_at: c.expires_at, is_used: c.is_used,
    })),
  };
}

// ─── 地址 ────────────────────────────────────────────────────────────────────

export function demoListAddresses(userId: string) {
  return demoStore().addresses.filter((a) => a.user_id === userId);
}

export function demoSaveAddress(userId: string, input: Partial<DemoAddress> & { id?: string }) {
  const store = demoStore();
  if (input.is_default) store.addresses.forEach((a) => { if (a.user_id === userId) a.is_default = false; });
  if (input.id) {
    const idx = store.addresses.findIndex((a) => a.id === input.id && a.user_id === userId);
    if (idx === -1) throw new Error("Address not found");
    store.addresses[idx] = { ...store.addresses[idx], ...input } as DemoAddress;
    return store.addresses[idx];
  }
  const addr: DemoAddress = {
    id: `addr-${Date.now().toString(36)}`,
    user_id: userId,
    label: input.label || "新地址",
    phone: input.phone || "",
    address_line1: input.address_line1 || "",
    address_line2: input.address_line2 ?? null,
    city: input.city || "",
    state: input.state || "",
    zip: input.zip || "",
    country: input.country || "CN",
    is_default: input.is_default ?? store.addresses.filter((a) => a.user_id === userId).length === 0,
    created_at: new Date().toISOString(),
  };
  store.addresses.push(addr);
  return addr;
}

export function demoDeleteAddress(userId: string, id: string) {
  const store = demoStore();
  const idx = store.addresses.findIndex((a) => a.id === id && a.user_id === userId);
  if (idx === -1) throw new Error("Address not found");
  store.addresses.splice(idx, 1);
  return true;
}

// ─── 后台统计 ────────────────────────────────────────────────────────────────

export function demoDashboardStats() {
  const { orders } = demoStore();
  const paid = orders.filter((o) => o.payment_status === "paid");
  const revenue = paid.reduce((s, o) => s + Number(o.total_amount), 0);
  const refunded = orders.filter((o) => o.has_refund).reduce((s, o) => s + Number(o.total_amount), 0);
  return {
    totalProducts: DEMO_PRODUCTS.length,
    totalOrders: orders.length + 1284,
    totalRevenue: (revenue + 184_620).toFixed(2),
    totalCustomers: 3268,
    activeServices: DEMO_PRODUCTS.filter((p) => p.type === "service").length,
    pendingOrders: orders.filter((o) => o.status === "pending").length + 17,
    processingOrders: orders.filter((o) => o.status === "processing").length + 42,
    refundRate: ((refunded / Math.max(1, revenue)) * 100 + 1.2).toFixed(2),
    avgOrderValue: ((revenue + 184_620) / (orders.length + 1284)).toFixed(2),
    lowStock: DEMO_PRODUCTS.filter((p) => p.type === "physical" && p.stock < 15).length,
    conversionRate: "3.84",
    repeatPurchaseRate: "27.6",
  };
}

/** 近 N 天收入趋势：稳定伪随机，保证每次刷新图形一致 */
export function demoRevenueSeries(days = 30) {
  const out: { date: string; revenue: number; orders: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = d.getUTCDate() + d.getUTCMonth() * 31;
    const wave = Math.sin(key / 3.1) * 0.28 + Math.cos(key / 7.7) * 0.16;
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6 ? 0.78 : 1;
    const base = 5200 + (days - i) * 42;
    const revenue = Math.round(base * (1 + wave) * weekend);
    out.push({
      date: d.toISOString().slice(0, 10),
      revenue,
      orders: Math.max(6, Math.round(revenue / 168)),
    });
  }
  return out;
}

export function demoTrafficSeries(days = 30) {
  return demoRevenueSeries(days).map((d, i) => {
    const pv = Math.round(d.orders * 41 + 620 + Math.sin(i / 2.3) * 180);
    return { date: d.date, pv, uv: Math.round(pv * 0.42), visitors: Math.round(pv * 0.42) };
  });
}

export function demoTopProducts(limit = 8) {
  return [...DEMO_PRODUCTS]
    .sort((a, b) => b.sold_count * Number(b.price) - a.sold_count * Number(a.price))
    .slice(0, limit)
    .map((p) => ({
      id: p.id, title: p.title, type: p.type,
      quantity: p.sold_count,
      revenue: (p.sold_count * Number(p.price)).toFixed(2),
      orders: Math.round(p.sold_count * 0.82),
    }));
}

export function demoCategoryDistribution() {
  const map = new Map<string, number>();
  DEMO_PRODUCTS.forEach((p) => map.set(p.category_name, (map.get(p.category_name) ?? 0) + 1));
  return [...map.entries()].map(([name, value]) => ({ name, value }));
}

export function demoOrderStatusDistribution() {
  const { orders } = demoStore();
  const base: Record<string, number> = { pending: 17, paid: 63, processing: 42, completed: 1096, cancelled: 38, refunded: 28 };
  orders.forEach((o) => { base[o.status] = (base[o.status] ?? 0) + 1; });
  return Object.entries(base).map(([name, value]) => ({ name, value }));
}

export function demoPaymentDistribution() {
  return [
    { name: "PayPal", value: 612 },
    { name: "Stripe", value: 488 },
    { name: "银行转账", value: 126 },
    { name: "货到付款", value: 58 },
  ];
}

export function demoTrafficSources() {
  return [
    { name: "自然搜索", value: 4820 },
    { name: "直接访问", value: 3140 },
    { name: "社交媒体", value: 2260 },
    { name: "付费广告", value: 1680 },
    { name: "邮件营销", value: 940 },
    { name: "分销推荐", value: 620 },
  ];
}

export function demoPageRanking() {
  return [
    { page: "/", views: 18_420, uv: 7_640 },
    { page: "/products", views: 12_180, uv: 5_210 },
    { page: "/products/prod-20", views: 6_840, uv: 3_120 },
    { page: "/products/prod-12", views: 5_260, uv: 2_480 },
    { page: "/consulting", views: 4_120, uv: 1_960 },
    { page: "/cart", views: 3_480, uv: 1_740 },
    { page: "/checkout", views: 2_260, uv: 1_180 },
    { page: "/about", views: 1_640, uv: 920 },
  ];
}

export function demoCustomers(limit = 12) {
  const names = [
    ["Alex Chen", "demo@example.com", "CN"], ["Marta Oliveira", "marta@oliveiratrade.br", "BR"],
    ["Daniel Krause", "d.krause@nordhandel.de", "DE"], ["Aiko Tanaka", "aiko@tanaka-shoji.jp", "JP"],
    ["Luis Fernández", "luis@iberimport.es", "ES"], ["Sarah Whitfield", "sarah@whitfieldco.uk", "GB"],
    ["Rafael Costa", "rafael@costalog.pt", "PT"], ["Emma Lindqvist", "emma@nordicsupply.se", "SE"],
    ["Tomás Ribeiro", "tomas@ribeirotech.br", "BR"], ["Nina Petrova", "nina@balticroute.lv", "LV"],
    ["Omar Haddad", "omar@levanttrade.ae", "AE"], ["Grace Mwangi", "grace@savannahlink.ke", "KE"],
  ];
  return names.slice(0, limit).map(([name, email, country], i) => {
    const ordersCount = 14 - i;
    const spent = (ordersCount * 486.4 + i * 133).toFixed(2);
    const tier = [...DEMO_TIERS].reverse().find((t) => Number(spent) >= Number(t.min_spent)) ?? DEMO_TIERS[0];
    return {
      id: `cust-${i + 1}`, name, email, country,
      orders: ordersCount, total_spent: spent,
      tier: tier.name, tier_level: tier.level,
      last_order_at: daysAgo(i * 3 + 1),
      created_at: daysAgo(200 - i * 9),
    };
  });
}
/** 演示模式的转化漏斗（标签与数据都是演示用的固定文案） */
export function demoFunnelSteps(totalUv: number, checkoutCount: number, paidOrderCount: number) {
  const pct = (n: number) => Number(((n / Math.max(1, totalUv)) * 100).toFixed(1));
  return [
    { label: '访问', count: totalUv, rate: 100 },
    { label: '浏览商品', count: Math.round(totalUv * 0.62), rate: 62 },
    { label: '加入购物车', count: Math.round(totalUv * 0.21), rate: 21 },
    { label: '进入结算', count: checkoutCount, rate: pct(checkoutCount) },
    { label: '完成支付', count: paidOrderCount, rate: pct(paidOrderCount) },
  ];
}

/** 演示模式下后台改订单状态时写入的时间线说明 */
export function demoStatusNote(status: string) {
  return `状态更新为 ${status}`;
}
