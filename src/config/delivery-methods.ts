/**
 * 交付方式字典。
 *
 * 阶段 1：硬编码 + i18n key（作为 fallback）。
 * 阶段 2（当前）：delivery_methods 数据库表 + 后台 CRUD。
 *
 * 本文件保留作为 fallback：API 失败时仍能用默认选项。
 * @see Claude 架构方案 §C — 阶段 2 字典化
 */

export interface DeliveryMethodDef {
  code: string;
  /** 中文标签 */
  label: string;
  /** i18n key，如 "delivery.online" */
  i18nKey: string;
  /** 默认图标（Phosphor Icon name） */
  icon: string;
  /** 适用的商品类型（service | virtual | physical） */
  applicableTypes: string[];
  /** 排序权重 */
  sort: number;
}

/**
 * API 返回的交付方式（可能包含自定义方式）
 */
export interface ApiDeliveryMethod {
  id: string;
  code: string;
  label: string;
  label_en: string | null;
  applicable_types: string[];
  sort_order: number;
  is_active: boolean;
  is_builtin: boolean;
}

/** 所有支持的交付方式 */
export const DELIVERY_METHODS: DeliveryMethodDef[] = [
  {
    code: "online",
    label: "在线交付",
    i18nKey: "delivery.online",
    icon: "WifiHigh",
    applicableTypes: ["service", "virtual"],
    sort: 1,
  },
  {
    code: "email",
    label: "邮件发送",
    i18nKey: "delivery.email",
    icon: "Envelope",
    applicableTypes: ["service", "virtual"],
    sort: 2,
  },
  {
    code: "download",
    label: "下载链接",
    i18nKey: "delivery.download",
    icon: "Download",
    applicableTypes: ["virtual"],
    sort: 3,
  },
  {
    code: "meeting",
    label: "视频会议",
    i18nKey: "delivery.meeting",
    icon: "VideoCamera",
    applicableTypes: ["service"],
    sort: 4,
  },
  {
    code: "phone",
    label: "电话咨询",
    i18nKey: "delivery.phone",
    icon: "Phone",
    applicableTypes: ["service"],
    sort: 5,
  },
  {
    code: "onsite",
    label: "上门服务",
    i18nKey: "delivery.onsite",
    icon: "MapPin",
    applicableTypes: ["service"],
    sort: 6,
  },
  {
    code: "shipping",
    label: "物流发货",
    i18nKey: "delivery.shipping",
    icon: "Truck",
    applicableTypes: ["physical"],
    sort: 7,
  },
  {
    code: "in_store",
    label: "门店购买",
    i18nKey: "delivery.in_store",
    icon: "Storefront",
    applicableTypes: ["physical", "service", "virtual"],
    sort: 8,
  },
  {
    code: "pickup",
    label: "到店自提",
    i18nKey: "delivery.pickup",
    icon: "Bag",
    applicableTypes: ["physical"],
    sort: 9,
  },
  {
    code: "ship",
    label: "门店发货",
    i18nKey: "delivery.ship",
    icon: "PaperPlaneRight",
    applicableTypes: ["physical"],
    sort: 10,
  },
];

/**
 * 根据商品类型获取可用的交付方式列表
 */
export function getDeliveryMethodsForType(productType: string): DeliveryMethodDef[] {
  return DELIVERY_METHODS.filter((m) => m.applicableTypes.includes(productType));
}

/**
 * 根据 code 查找交付方式定义。
 *
 * 如果内置字典找不到，返回一个 fallback 定义（label 使用 code 本身），
 * 确保自定义交付方式至少能显示其 code。
 */
export function getDeliveryMethodByCode(code: string): DeliveryMethodDef {
  const found = DELIVERY_METHODS.find((m) => m.code === code);
  if (found) return found;
  // 未知自定义 code：至少返回 code 本身作为 label
  return {
    code,
    label: code,
    i18nKey: `delivery.${code}`,
    icon: "Cube",
    applicableTypes: [],
    sort: 999,
  };
}

/**
 * 通用的交付方式展示标签获取函数。
 * 优先使用 API 返回的自定义 label，fallback 到内置字典。
 */
export function getDeliveryLabel(code: string, apiMethods?: ApiDeliveryMethod[]): string {
  if (apiMethods) {
    const apiDef = apiMethods.find((m) => m.code === code);
    if (apiDef) return apiDef.label;
  }
  return getDeliveryMethodByCode(code).label;
}

/**
 * 将 API 返回的交付方式列表转换为内置 DeliveryMethodDef 数组（用于兼容旧组件）
 */
export function apiMethodsToDefs(apiMethods: ApiDeliveryMethod[]): DeliveryMethodDef[] {
  return apiMethods.map((m) => {
    const builtin = DELIVERY_METHODS.find((b) => b.code === m.code);
    return {
      code: m.code,
      label: m.label,
      i18nKey: builtin?.i18nKey ?? `delivery.${m.code}`,
      icon: builtin?.icon ?? "Cube",
      applicableTypes: m.applicable_types,
      sort: m.sort_order,
    };
  });
}

/**
 * 解析 products.delivery_method 字段（兼容旧单值、新 JSON 数组格式）
 */
export function parseDeliveryMethods(raw: string | null | undefined): string[] {
  if (!raw) return [];
  // 尝试 JSON 数组解析
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((c): c is string => typeof c === "string");
  } catch {
    // 不是 JSON，当作旧格式的单个值
  }
  // 旧格式：逗号分隔
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * 将交付方式数组序列化为存储格式（逗号分隔，兼容旧 varchar(50) 列）
 */
export function serializeDeliveryMethods(codes: string[]): string {
  return codes.filter(Boolean).join(",");
}
