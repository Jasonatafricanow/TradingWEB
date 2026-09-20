import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole, errorResponse } from "@/services/auth/auth-middleware";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    await requireStaffRole(request, ["admin", "operator"]);
    const tier = request.nextUrl.searchParams.get("tier") || "";

    // Build query based on tier filter
    let havingClause = "";
    if (tier === "vip") havingClause = "HAVING (total_orders >= 5 OR total_spent >= 500) AND (phone != '' OR whatsapp != '' OR email != '')";
    else if (tier === "active") havingClause = "HAVING last_order_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND total_orders > 0 AND total_orders < 5 AND total_spent < 500 AND (phone != '' OR whatsapp != '' OR email != '')";
    else if (tier === "new") havingClause = "HAVING total_orders = 0 AND (phone != '' OR whatsapp != '' OR email != '')";
    else if (tier === "at_risk") havingClause = "HAVING last_order_at < DATE_SUB(NOW(), INTERVAL 30 DAY) AND last_order_at >= DATE_SUB(NOW(), INTERVAL 90 DAY) AND (phone != '' OR whatsapp != '' OR email != '')";
    else if (tier === "lost") havingClause = "HAVING last_order_at < DATE_SUB(NOW(), INTERVAL 90 DAY) AND (phone != '' OR whatsapp != '' OR email != '')";

    const [rows] = await db.$client.execute(
      `SELECT u.id, u.email, u.name, u.created_at,
        COALESCE(p.phone, '') as phone, COALESCE(p.whatsapp, '') as whatsapp, COALESCE(p.tags, '') as tags,
        COALESCE((SELECT COUNT(*) FROM orders WHERE orders.user_id = u.id), 0) as total_orders,
        CAST(COALESCE((SELECT SUM(total_amount) FROM orders WHERE orders.user_id = u.id), 0) AS DECIMAL(10,2)) as total_spent,
        (SELECT MAX(created_at) FROM orders WHERE orders.user_id = u.id) as last_order_at
      FROM users u
      LEFT JOIN profiles p ON u.email = p.email
      ${havingClause ? `GROUP BY u.id, u.email, u.name, u.created_at, p.phone, p.whatsapp, p.tags ${havingClause}` : 'ORDER BY u.created_at DESC'}`
    );

    const data = (rows as Record<string, unknown>[]) || [];

    // Build CSV
    const headers = ["Email", "Name", "Phone", "WhatsApp", "Total Orders", "Total Spent", "Last Order At", "Tags", "Tier"];
    const csvRows = [headers.map(e => `"${e}"`).join(",")];

    for (const row of data) {
      const tierLabel = (() => {
        const orders = Number(row.total_orders || 0);
        const spent = Number(row.total_spent || 0);
        if (orders >= 5 || spent >= 500) return "VIP";
        if (orders > 0) {
          const lastOrder = row.last_order_at as string;
          if (lastOrder) {
            const days = Math.floor((Date.now() - new Date(lastOrder).getTime()) / 86400000);
            if (days <= 30) return "Active";
            if (days <= 90) return "At Risk";
            return "Lost";
          }
        }
        return "New";
      })();

      csvRows.push([
        row.email || "",
        row.name || "",
        row.phone || "",
        row.whatsapp || "",
        String(row.total_orders || "0"),
        String(row.total_spent || "0"),
        row.last_order_at ? String(row.last_order_at).split("T")[0] : "",
        row.tags || "",
        tierLabel,
      ].map(e => `"${String(e).replace(/"/g, '""')}"`).join(","));
    }

    const csvContent = csvRows.join("\n");
    const filename = tier ? `customers-${tier}.csv` : "customers-all.csv";

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
