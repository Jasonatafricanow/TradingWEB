import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { orders, orderItems } from '@/storage/database/shared/schema';

export async function generateInvoiceHtml(orderId: string): Promise<string> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error('Order not found');

  const items = await db.select().from(orderItems).where(eq(orderItems.order_id, orderId));

  const itemsHtml = (items || [])
    .map(
      (item) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee">${item.product_title}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">$${parseFloat(item.unit_price).toFixed(2)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">$${parseFloat(item.subtotal).toFixed(2)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Invoice - ${order.order_no}</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #333; }
  h1 { color: #2563eb; font-size: 24px; }
  .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
  .info { margin-bottom: 20px; }
  .info td { padding: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th { background: #f3f4f6; padding: 10px 8px; text-align: left; font-size: 14px; }
  .total { text-align: right; font-size: 18px; font-weight: bold; margin-top: 20px; }
  .footer { margin-top: 60px; text-align: center; color: #999; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px; }
</style></head><body>
  <div class="header">
    <div><h1>INVOICE</h1><p style="color:#666">${order.order_no}</p></div>
    <div style="text-align:right"><strong>GlobalTrade Hub</strong><br>support@globaltrade-hub.com</div>
  </div>
  <table class="info">
    <tr><td><strong>Bill To:</strong></td><td>${order.buyer_name || order.buyer_email || 'N/A'}</td></tr>
    <tr><td><strong>Date:</strong></td><td>${new Date(order.created_at).toLocaleDateString()}</td></tr>
    <tr><td><strong>Status:</strong></td><td>${order.status}</td></tr>
  </table>
  <table>
    <thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Subtotal</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="total">
    Total: $${parseFloat(order.total_amount || '0').toFixed(2)}
    ${order.discount_amount && parseFloat(order.discount_amount) > 0 ? `<br><span style="color:#059669;font-size:14px;font-weight:normal">Discount: -$${parseFloat(order.discount_amount).toFixed(2)}</span>` : ''}
  </div>
  <div class="footer">
    <p>GlobalTrade Hub &mdash; Cross-Border Consulting & Digital Goods Platform</p>
    <p>Thank you for your business!</p>
  </div>
</body></html>`;
}
