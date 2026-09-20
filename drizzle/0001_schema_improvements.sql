-- Schema Improvements: 树形分类、商品规格/变体、双状态订单、Tags、地址结构
-- 在 0000_legal_malcolm_colcord.sql 之后执行

-- ==================== 分类（树形） ====================
ALTER TABLE `categories`
  ADD COLUMN `slug` varchar(150),
  ADD COLUMN `parent_id` varchar(36),
  ADD COLUMN `level` int NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX `categories_parent_id_idx` ON `categories` (`parent_id`);
--> statement-breakpoint
CREATE INDEX `categories_slug_idx` ON `categories` (`slug`);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`slug`);

-- ==================== 商品（Tags + Slug） ====================
--> statement-breakpoint
ALTER TABLE `products`
  ADD COLUMN `slug` varchar(200),
  ADD COLUMN `tags` text;
--> statement-breakpoint
CREATE INDEX `products_slug_idx` ON `products` (`slug`);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);

-- ==================== 商品规格/变体 ====================
--> statement-breakpoint
CREATE TABLE `product_variants` (
  `id` varchar(36) NOT NULL DEFAULT (UUID()),
  `product_id` varchar(36) NOT NULL,
  `title` varchar(200),
  `sku` varchar(100),
  `price` decimal(10,2) NOT NULL,
  `compare_at_price` decimal(10,2),
  `cost` decimal(10,2),
  `weight` decimal(10,2),
  `weight_unit` varchar(10) DEFAULT 'kg',
  `stock` int NOT NULL DEFAULT 0,
  `option1` varchar(255),
  `option2` varchar(255),
  `option3` varchar(255),
  `position` int DEFAULT 1,
  `is_default` boolean NOT NULL DEFAULT false,
  `image` varchar(500),
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp,
  CONSTRAINT `product_variants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `pv_product_id_idx` ON `product_variants` (`product_id`);
--> statement-breakpoint
CREATE INDEX `pv_sku_idx` ON `product_variants` (`sku`);

-- ==================== 商品图片 ====================
--> statement-breakpoint
CREATE TABLE `product_images` (
  `id` varchar(36) NOT NULL DEFAULT (UUID()),
  `product_id` varchar(36) NOT NULL,
  `variant_id` varchar(36),
  `src` text NOT NULL,
  `alt` varchar(500),
  `position` int DEFAULT 1,
  `width` int,
  `height` int,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `product_images_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `pi_product_id_idx` ON `product_images` (`product_id`);
--> statement-breakpoint
CREATE INDEX `pi_variant_id_idx` ON `product_images` (`variant_id`);

-- ==================== 订单（双状态 + 地址） ====================
--> statement-breakpoint
ALTER TABLE `orders`
  ADD COLUMN `financial_status` varchar(20) DEFAULT 'pending',
  ADD COLUMN `fulfillment_status` varchar(20) DEFAULT 'unfulfilled',
  ADD COLUMN `buyer_phone` varchar(50),
  ADD COLUMN `shipping_address` json,
  ADD COLUMN `billing_address` json,
  ADD COLUMN `tags` text;
--> statement-breakpoint
CREATE INDEX `orders_financial_status_idx` ON `orders` (`financial_status`);
--> statement-breakpoint
CREATE INDEX `orders_fulfillment_status_idx` ON `orders` (`fulfillment_status`);

-- ==================== 订单明细（变体支持） ====================
--> statement-breakpoint
ALTER TABLE `order_items`
  ADD COLUMN `variant_id` varchar(36),
  ADD COLUMN `sku` varchar(100);
--> statement-breakpoint
CREATE INDEX `order_items_variant_id_idx` ON `order_items` (`variant_id`);

-- ==================== 库存（变体支持） ====================
--> statement-breakpoint
ALTER TABLE `inventory`
  ADD COLUMN `variant_id` varchar(36);
--> statement-breakpoint
CREATE INDEX `inventory_variant_id_idx` ON `inventory` (`variant_id`);

-- ==================== 库存变动日志（变体支持） ====================
--> statement-breakpoint
ALTER TABLE `inventory_transactions`
  ADD COLUMN `variant_id` varchar(36);

-- ==================== 调拨单（变体支持） ====================
--> statement-breakpoint
ALTER TABLE `stock_transfers`
  ADD COLUMN `variant_id` varchar(36);

-- ==================== 优惠券（时间范围） ====================
--> statement-breakpoint
ALTER TABLE `coupons`
  ADD COLUMN `starts_at` timestamp;

-- ==================== 员工管理（权限） ====================
--> statement-breakpoint
ALTER TABLE `staff`
  ADD COLUMN `permissions` json;

-- ==================== 客户地址（完整字段） ====================
--> statement-breakpoint
ALTER TABLE `customer_addresses`
  ADD COLUMN `first_name` varchar(100),
  ADD COLUMN `last_name` varchar(100),
  ADD COLUMN `company` varchar(200);

-- ==================== 用户档案 ====================
--> statement-breakpoint
CREATE TABLE `profiles` (
  `id` varchar(36) NOT NULL DEFAULT (UUID()),
  `email` varchar(255),
  `display_name` varchar(100),
  `avatar_url` varchar(500),
  `locale` varchar(10) DEFAULT 'en',
  `currency` varchar(3) DEFAULT 'USD',
  `is_admin` boolean NOT NULL DEFAULT false,
  `tags` text,
  `accepts_marketing` boolean NOT NULL DEFAULT false,
  `tax_exempt` boolean NOT NULL DEFAULT false,
  `total_spent` decimal(12,2) DEFAULT '0',
  `orders_count` int DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp,
  CONSTRAINT `profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `profiles_email_idx` ON `profiles` (`email`);
