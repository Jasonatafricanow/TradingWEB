import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export async function sendEmail(to: string, subject: string, body: string) {
  try {
    const id = randomUUID();
    await db.$client.execute(
      'INSERT INTO email_logs (id, recipient, subject, body, status) VALUES (?, ?, ?, ?, ?)',
      [id, to, subject, body, 'sent']
    );
    const [rows] = await db.$client.execute('SELECT * FROM email_logs WHERE id = ?', [id]);
    return (rows as Record<string, unknown>[])[0];
  } catch (error) {
    throw error;
  }
}

export async function sendOrderConfirmation(to: string, orderNo: string, items: { product_title: string }[]) {
  const subject = 'Order Confirmation - ' + orderNo;
  const body = 'Thank you for your order ' + orderNo + '. Items: ' + items.map(i => i.product_title).join(', ');
  return sendEmail(to, subject, body);
}

export async function sendAbandonedCartReminder(to: string, items: { title: string }[]) {
  const subject = 'You left something in your cart!';
  const body = 'Your cart items: ' + items.map((i) => i.title).join(', ');
  return sendEmail(to, subject, body);
}

export const renderTemplate = sendEmail
