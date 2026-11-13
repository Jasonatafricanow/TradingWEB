import { csvStream } from "@/lib/csv";
import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const tier = request.nextUrl.searchParams.get("tier") || "";

    const contact = "(c.phone != '' OR c.whatsapp != '' OR c.email != '')";
    const tierWhere: Record<string, string> = {
      vip: `(c.total_orders >= 5 OR c.total_spent >= 500) AND ${contact}`,
      active: `c.last_order_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND c.total_orders > 0 AND c.total_orders < 5 AND c.total_spent < 500 AND ${contact}`,
      new: `c.total_orders = 0 AND ${contact}`,
      at_risk: `c.last_order_at < DATE_SUB(NOW(), INTERVAL 30 DAY) AND c.last_order_at >= DATE_SUB(NOW(), INTERVAL 90 DAY) AND ${contact}`,
      lost: `c.last_order_at < DATE_SUB(NOW(), INTERVAL 90 DAY) AND ${contact}`,
    };
    const where = tierWhere[tier] ? `WHERE ${tierWhere[tier]}` : "";

    // One aggregate per page instead of three correlated subqueries per user;
    // ascending (created_at, id) keeps offsets stable while new users sign up.
    const fetchPage = async (offset: number, limit: number) => {
      const [rows] = await db.$client.execute(
        `SELECT * FROM (
          SELECT u.id, u.email, u.name, u.created_at,
            COALESCE(p.phone, '') AS phone, COALESCE(p.whatsapp, '') AS whatsapp, COALESCE(p.tags, '') AS tags,
            COALESCE(o.total_orders, 0) AS total_orders, COALESCE(o.total_spent, 0) AS total_spent, o.last_order_at
          FROM users u
          LEFT JOIN profiles p ON u.email = p.email
          LEFT JOIN (
            SELECT user_id, COUNT(*) AS total_orders, CAST(SUM(total_amount) AS DECIMAL(12,2)) AS total_spent, MAX(created_at) AS last_order_at
            FROM orders GROUP BY user_id
          ) o ON o.user_id = u.id
        ) c ${where}
        ORDER BY c.created_at ASC, c.id ASC
        LIMIT ${Math.trunc(limit)} OFFSET ${Math.trunc(offset)}`
      );
      return ((rows as Record<string, unknown>[]) || []).map(customerRow);
    };

    const headers = ["Email", "Name", "Phone", "WhatsApp", "Total Orders", "Total Spent", "Last Order At", "Tags", "Tier"];
    const filename = tierWhere[tier] ? `customers-${tier}.csv` : "customers-all.csv";

    return new NextResponse(csvStream(headers, fetchPage), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

function tierLabel(row: Record<string, unknown>) {
  const orders = Number(row.total_orders || 0);
  const spent = Number(row.total_spent || 0);
  if (orders >= 5 || spent >= 500) return "VIP";
  if (orders > 0 && row.last_order_at) {
    const days = Math.floor((Date.now() - new Date(row.last_order_at as string).getTime()) / 86400000);
    if (days <= 30) return "Active";
    if (days <= 90) return "At Risk";
    return "Lost";
  }
  return "New";
}

function customerRow(row: Record<string, unknown>): unknown[] {
  const last = row.last_order_at instanceof Date ? row.last_order_at.toISOString() : row.last_order_at;
  return [
    row.email || "",
    row.name || "",
    row.phone || "",
    row.whatsapp || "",
    String(row.total_orders || "0"),
    String(row.total_spent || "0"),
    last ? String(last).split("T")[0] : "",
    row.tags || "",
    tierLabel(row),
  ];
}
