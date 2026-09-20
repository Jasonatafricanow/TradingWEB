/**
 * 站点配置
 */
export const SITE = {
  name: "GlobalTrade Hub",
  shortName: "GlobalTrade",
  description: "跨境咨询交易平台",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://globaltrade-hub.com",
  email: "support@globaltrade-hub.com",
  phone: "+1-800-GLOBALTRADE",
  locale: "zh",
  currency: "USD",
} as const
