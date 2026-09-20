import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { db } from "@/lib/db";

function parseSettingValue(value: string | null): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function getPaymentRuntimeStatus(): Record<string, unknown> {
  const paypalClientId = Boolean(process.env.PAYPAL_CLIENT_ID);
  const paypalClientSecret = Boolean(process.env.PAYPAL_CLIENT_SECRET);
  const stripePublicKey = Boolean(process.env.STRIPE_PUBLIC_KEY);
  const stripeSecretKey = Boolean(process.env.STRIPE_SECRET_KEY);

  return {
    source: "env",
    paypalConfigured: paypalClientId && paypalClientSecret,
    paypalClientIdConfigured: paypalClientId,
    paypalClientSecretConfigured: paypalClientSecret,
    paypalSandbox: process.env.PAYPAL_SANDBOX !== "false",
    stripeConfigured: stripePublicKey && stripeSecretKey,
    stripePublicKeyConfigured: stripePublicKey,
    stripeSecretKeyConfigured: stripeSecretKey,
    stripeSandbox: process.env.STRIPE_SANDBOX !== "false",
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin"]);

    let rows: { key: string; value: string | null }[] = [];
    try {
      const [result] = await db.$client.execute(
        "SELECT `key`, `value` FROM `site_settings` WHERE `key` LIKE 'site.%' OR `key` LIKE 'security.%'"
      );
      rows = result as { key: string; value: string | null }[];
    } catch {
      rows = [];
    }

    const result: {
      site: Record<string, unknown>;
      payment: Record<string, unknown>;
      security: Record<string, unknown>;
    } = { site: {}, payment: getPaymentRuntimeStatus(), security: {} };

    for (const row of rows) {
      const dotIdx = row.key.indexOf(".");
      if (dotIdx < 1) continue;
      const section = row.key.slice(0, dotIdx) as "site" | "security";
      const field = row.key.slice(dotIdx + 1);
      result[section][field] = parseSettingValue(row.value);
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin"]);
    const body = await request.json();

    const sections: Array<"site" | "security"> = ["site", "security"];
    for (const section of sections) {
      const part = body?.[section];
      if (!part || typeof part !== "object") continue;

      for (const [field, value] of Object.entries(part as Record<string, unknown>)) {
        const stored = value === null || value === undefined ? "" : String(value);
        await db.$client.execute(
          "INSERT INTO `site_settings` (`key`, `value`) VALUES (?, ?) " +
            "ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
          [`${section}.${field}`, stored]
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
