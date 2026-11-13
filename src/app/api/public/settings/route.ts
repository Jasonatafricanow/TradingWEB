import { NextResponse } from "next/server";
import { IS_DEMO_MODE } from "@/config/constants";

/**
 * 公开站点设置 —— 只暴露前台展示所需的非敏感字段（联系方式、站点名等）。
 * 绝不返回支付密钥、SMTP 凭据等敏感配置。
 */
const PUBLIC_KEYS = [
  "site.name",
  "site.whatsappNumber",
  "site.whatsappMessage",
  "site.supportEmail",
  "site.theme",
] as const;

const DEMO_SITE = {
  name: "GlobalTrade Hub",
  whatsappNumber: "258878888181",
  whatsappMessage: "Hi, I'm interested in your products on GlobalTrade Hub.",
  supportEmail: "support@fjglobal.online",
  theme: "shopify",
};

export async function GET() {
  if (IS_DEMO_MODE) {
    return NextResponse.json({ data: { site: DEMO_SITE } });
  }
  try {
    const { db } = await import("@/lib/db");
    const [rows] = await db.$client.execute(
      `SELECT \`key\`, \`value\` FROM \`site_settings\` WHERE \`key\` IN (${PUBLIC_KEYS.map(() => "?").join(",")})`,
      [...PUBLIC_KEYS]
    );
    const site: Record<string, string> = {};
    for (const row of rows as { key: string; value: string | null }[]) {
      const field = row.key.replace(/^site\./, "");
      if (row.value != null) site[field] = row.value;
    }
    return NextResponse.json({ data: { site } });
  } catch {
    return NextResponse.json({ data: { site: {} } });
  }
}