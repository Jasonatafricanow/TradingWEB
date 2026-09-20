/**
 * Drizzle 关系定义
 *
 * 在此按需添加表间关系，用于嵌套查询。
 */
import { relations } from "drizzle-orm/relations";
import { orders, orderItems, products, categories } from "./schema";

export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.order_id],
    references: [orders.id],
  }),
}));

export const productsRelations = relations(products, ({ one }) => ({
  category: one(categories, {
    fields: [products.category_id],
    references: [categories.id],
  }),
}));
