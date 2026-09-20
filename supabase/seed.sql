-- 默认邮件模板（可覆盖）
INSERT INTO email_templates (key, name, subject, body_html, variables) VALUES
('payment_confirmed', 'Payment Confirmed', '订单 {{order_no}} 付款确认 — GlobalTrade Hub',
 '<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
   <h2>感谢您的购买！</h2>
   <p>您好 {{buyer_name}}，</p>
   <p>您的订单 <strong>{{order_no}}</strong> 已成功付款。</p>
   <p><strong>金额：</strong>${{total_amount}}</p>
   <p><strong>日期：</strong>{{order_date}}</p>
   <h3>订单明细</h3>
   <pre style="background:#f5f5f5;padding:12px;border-radius:8px">{{item_list}}</pre>
   <p>我们会在处理后第一时间通知您。</p>
   <hr>
   <p style="color:#888;font-size:12px">GlobalTrade Hub — 跨境贸易平台</p>
  </div>',
 'buyer_name,order_no,total_amount,item_list,order_date'),

('shipped', 'Order Shipped', '订单 {{order_no}} 已发货 — GlobalTrade Hub',
 '<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
   <h2>您的订单已发货！</h2>
   <p>您好 {{buyer_name}}，</p>
   <p>订单 <strong>{{order_no}}</strong> 已处理完成。</p>
   <p>如果您购买的是虚拟商品，请登录账户查看下载链接。<br>
   如果是咨询服务，我们将按约定时间与您联系。</p>
   <p>如有疑问，请联系客服。</p>
   <hr>
   <p style="color:#888;font-size:12px">GlobalTrade Hub — 跨境贸易平台</p>
  </div>',
 'buyer_name,order_no,order_date'),

('abandoned_cart', 'Abandoned Cart', '您有商品未付款 — 额外{{discount}}优惠',
 '<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
   <h2>您的购物车还在等您！</h2>
   <p>我们注意到您之前添加了商品到购物车但未完成支付。</p>
   <p>作为回头客，我们为您准备了专属优惠：</p>
   <div style="text-align:center;padding:20px;background:#f0f9ff;border-radius:12px;margin:16px 0">
     <p style="font-size:14px;color:#666">使用优惠码</p>
     <p style="font-size:28px;font-weight:bold;color:#2563eb;letter-spacing:4px">{{coupon_code}}</p>
     <p style="font-size:16px;color:#059669">立享 <strong>{{discount}}</strong> 折扣</p>
     <p style="font-size:12px;color:#999">有效期 {{days}} 天</p>
   </div>
   <p>优惠码在结账时输入即可使用，不要错过哦！</p>
   <hr>
   <p style="color:#888;font-size:12px">GlobalTrade Hub — 跨境贸易平台</p>
  </div>',
 'coupon_code,discount,total,days')
ON CONFLICT (key) DO NOTHING;
