/**
 * 渠道归因工具 — FJ-B1-A
 *
 * 从 localStorage 读取首次落地页/UTM/推广参数，供 pageview、checkout、orders 使用。
 * 纯客户端工具，仅在浏览器环境运行。
 */

export interface AttributionData {
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  fbclid: string | null
  igshid: string | null
  referrer: string | null
  first_landing: string | null
  landing_at: string | null
}

export function getAttribution(): AttributionData | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem("attribution");
    if (!raw) return null;
    return JSON.parse(raw) as AttributionData;
  } catch {
    return null;
  }
}

/**
 * 获取简化的来源标签，用于写入订单 source 字段或展示。
 * 优先级：fbclid → igshid → utm_source → 'direct'
 */
export function getAttributionSource(): string {
  const attr = getAttribution();
  if (!attr) return "direct";

  if (attr.fbclid) return "facebook";
  if (attr.igshid) return "instagram";
  if (attr.utm_source === "instagram") return "instagram";
  if (attr.utm_source === "facebook") return "facebook";
  if (attr.utm_source === "whatsapp") return "whatsapp";
  if (attr.utm_source) return attr.utm_source;

  return "direct";
}
