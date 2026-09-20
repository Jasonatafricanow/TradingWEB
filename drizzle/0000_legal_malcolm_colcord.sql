CREATE TABLE `abandoned_carts` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`user_id` varchar(36),
	`email` varchar(255),
	`items` json,
	`total` decimal(10,2),
	`coupon_id` varchar(36),
	`coupon_sent` boolean NOT NULL DEFAULT false,
	`notified_at` timestamp,
	`abandoned_at` timestamp NOT NULL DEFAULT (now()),
	`recovered_at` timestamp,
	CONSTRAINT `abandoned_carts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`user_id` varchar(36),
	`action` varchar(100) NOT NULL,
	`entity_type` varchar(50),
	`entity_id` varchar(36),
	`details` json,
	`ip_address` varchar(50),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`name` varchar(100) NOT NULL,
	`name_en` varchar(100),
	`name_ja` varchar(100),
	`name_es` varchar(100),
	`type` varchar(20) NOT NULL DEFAULT 'service',
	`icon` varchar(50),
	`sort_order` int NOT NULL DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`user_id` varchar(36),
	`title` varchar(200),
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`assigned_to` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`code` varchar(50) NOT NULL,
	`type` varchar(10) NOT NULL,
	`value` decimal(10,2) NOT NULL,
	`min_order_amount` decimal(10,2) DEFAULT '0',
	`max_discount` decimal(10,2),
	`usage_limit` int DEFAULT 0,
	`used_count` int DEFAULT 0,
	`expires_at` timestamp,
	`is_active` boolean NOT NULL DEFAULT true,
	`description` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp,
	CONSTRAINT `coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `coupons_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `customer_addresses` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`user_id` varchar(36) NOT NULL,
	`label` varchar(50),
	`phone` varchar(50),
	`address_line1` varchar(200) NOT NULL,
	`address_line2` varchar(200),
	`city` varchar(100) NOT NULL,
	`state` varchar(100),
	`zip` varchar(20),
	`country` varchar(100) NOT NULL DEFAULT 'Moz',
	`is_default` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_addresses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_logs` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`to_email` varchar(255) NOT NULL,
	`subject` varchar(200) NOT NULL,
	`template_key` varchar(50),
	`status` varchar(20) NOT NULL DEFAULT 'sent',
	`error` text,
	`order_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_templates` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`key` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`subject` varchar(200) NOT NULL,
	`body_html` text NOT NULL,
	`variables` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp,
	CONSTRAINT `email_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_templates_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `health_check` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`updated_at` timestamp DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `inventory` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`product_id` varchar(36) NOT NULL,
	`warehouse_id` varchar(36),
	`stock` int NOT NULL DEFAULT 0,
	`low_stock_threshold` int NOT NULL DEFAULT 10,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_transactions` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`product_id` varchar(36) NOT NULL,
	`type` varchar(20) NOT NULL,
	`quantity` int NOT NULL,
	`before_stock` int NOT NULL,
	`after_stock` int NOT NULL,
	`note` text,
	`operator_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `membership_tiers` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`name` varchar(50) NOT NULL,
	`level` int NOT NULL,
	`min_total_spent` decimal(10,2) NOT NULL DEFAULT '0',
	`discount_percent` decimal(5,2) NOT NULL DEFAULT '0',
	`badge_color` varchar(20),
	`benefits` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `membership_tiers_id` PRIMARY KEY(`id`),
	CONSTRAINT `membership_tiers_level_unique` UNIQUE(`level`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`conversation_id` varchar(36) NOT NULL,
	`role` varchar(20) NOT NULL,
	`content` text NOT NULL,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`order_id` varchar(36) NOT NULL,
	`product_id` varchar(36) NOT NULL,
	`product_title` varchar(200) NOT NULL,
	`product_type` varchar(20) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unit_price` decimal(10,2) NOT NULL,
	`subtotal` decimal(10,2) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`user_id` varchar(36) NOT NULL,
	`order_no` varchar(32) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`total_amount` decimal(10,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`payment_method` varchar(20),
	`payment_status` varchar(20) DEFAULT 'unpaid',
	`payment_id` varchar(200),
	`buyer_email` varchar(255),
	`buyer_name` varchar(128),
	`notes` text,
	`coupon_id` varchar(36),
	`discount_amount` decimal(10,2),
	`has_refund` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_order_no_unique` UNIQUE(`order_no`)
);
--> statement-breakpoint
CREATE TABLE `page_views` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`path` varchar(500) NOT NULL,
	`title` varchar(500),
	`referrer` text,
	`user_agent` varchar(500),
	`ip_anonymized` varchar(64),
	`country` varchar(100),
	`visitor_id` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `page_views_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_recommendations` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`product_id` varchar(36) NOT NULL,
	`recommended_product_id` varchar(36) NOT NULL,
	`type` varchar(10) NOT NULL DEFAULT 'manual',
	`sort_order` int DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_recommendations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_reviews` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`product_id` varchar(36) NOT NULL,
	`user_id` varchar(36),
	`rating` int NOT NULL,
	`title` varchar(200),
	`content` text,
	`is_verified` boolean NOT NULL DEFAULT false,
	`is_approved` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`title` varchar(200) NOT NULL,
	`title_en` varchar(200),
	`title_ja` varchar(200),
	`title_es` varchar(200),
	`description` text,
	`description_en` text,
	`description_ja` text,
	`description_es` text,
	`price` decimal(10,2) NOT NULL,
	`category_id` varchar(36) NOT NULL,
	`type` varchar(20) NOT NULL DEFAULT 'service',
	`image_key` varchar(500),
	`seller_id` varchar(36) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`duration` varchar(50),
	`delivery_method` varchar(50),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`order_id` varchar(36) NOT NULL,
	`order_item_id` varchar(36),
	`user_id` varchar(36),
	`reason` text NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`evidence` text,
	`admin_note` text,
	`restocked` boolean NOT NULL DEFAULT false,
	`processed_by` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`processed_at` timestamp,
	CONSTRAINT `refunds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staff` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`user_id` varchar(36),
	`role` varchar(20) NOT NULL DEFAULT 'support',
	`name` varchar(100) NOT NULL,
	`email` varchar(255) NOT NULL,
	`phone` varchar(50),
	`avatar_url` varchar(500),
	`is_active` boolean NOT NULL DEFAULT true,
	`last_login_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp,
	CONSTRAINT `staff_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_user_id_unique` UNIQUE(`user_id`),
	CONSTRAINT `staff_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `stock_transfers` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`product_id` varchar(36) NOT NULL,
	`from_warehouse_id` varchar(36) NOT NULL,
	`to_warehouse_id` varchar(36) NOT NULL,
	`quantity` int NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`note` text,
	`operator_id` varchar(36),
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_transfers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_memberships` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`user_id` varchar(36) NOT NULL,
	`tier_id` varchar(36),
	`total_spent` decimal(10,2) NOT NULL DEFAULT '0',
	`total_orders` int NOT NULL DEFAULT 0,
	`joined_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp,
	CONSTRAINT `user_memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_memberships_user_id_unique` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `warehouses` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`name` varchar(100) NOT NULL,
	`location` varchar(200),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `warehouses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wishlist_items` (
	`id` varchar(36) NOT NULL DEFAULT (UUID()),
	`user_id` varchar(36) NOT NULL,
	`product_id` varchar(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wishlist_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `wi_user_product_idx` UNIQUE(`user_id`,`product_id`)
);
--> statement-breakpoint
ALTER TABLE `inventory` ADD CONSTRAINT `inventory_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory` ADD CONSTRAINT `inventory_warehouse_id_warehouses_id_fk` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_recommendations` ADD CONSTRAINT `product_recommendations_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_recommendations` ADD CONSTRAINT `product_recommendations_recommended_product_id_products_id_fk` FOREIGN KEY (`recommended_product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_reviews` ADD CONSTRAINT `product_reviews_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_from_warehouse_id_warehouses_id_fk` FOREIGN KEY (`from_warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_to_warehouse_id_warehouses_id_fk` FOREIGN KEY (`to_warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wishlist_items` ADD CONSTRAINT `wishlist_items_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ac_user_id_idx` ON `abandoned_carts` (`user_id`);--> statement-breakpoint
CREATE INDEX `ac_abandoned_at_idx` ON `abandoned_carts` (`abandoned_at`);--> statement-breakpoint
CREATE INDEX `al_user_id_idx` ON `audit_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `al_entity_type_idx` ON `audit_logs` (`entity_type`);--> statement-breakpoint
CREATE INDEX `al_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `categories_type_idx` ON `categories` (`type`);--> statement-breakpoint
CREATE INDEX `categories_sort_order_idx` ON `categories` (`sort_order`);--> statement-breakpoint
CREATE INDEX `coupons_code_idx` ON `coupons` (`code`);--> statement-breakpoint
CREATE INDEX `coupons_expires_at_idx` ON `coupons` (`expires_at`);--> statement-breakpoint
CREATE INDEX `ca_user_id_idx` ON `customer_addresses` (`user_id`);--> statement-breakpoint
CREATE INDEX `el_created_at_idx` ON `email_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `et_key_idx` ON `email_templates` (`key`);--> statement-breakpoint
CREATE INDEX `inventory_product_id_idx` ON `inventory` (`product_id`);--> statement-breakpoint
CREATE INDEX `inv_tx_product_id_idx` ON `inventory_transactions` (`product_id`);--> statement-breakpoint
CREATE INDEX `inv_tx_created_at_idx` ON `inventory_transactions` (`created_at`);--> statement-breakpoint
CREATE INDEX `mt_level_idx` ON `membership_tiers` (`level`);--> statement-breakpoint
CREATE INDEX `msg_conversation_id_idx` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `msg_created_at_idx` ON `messages` (`created_at`);--> statement-breakpoint
CREATE INDEX `order_items_order_id_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_items_product_id_idx` ON `order_items` (`product_id`);--> statement-breakpoint
CREATE INDEX `orders_user_id_idx` ON `orders` (`user_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_order_no_idx` ON `orders` (`order_no`);--> statement-breakpoint
CREATE INDEX `orders_created_at_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `pv_path_idx` ON `page_views` (`path`);--> statement-breakpoint
CREATE INDEX `pv_created_at_idx` ON `page_views` (`created_at`);--> statement-breakpoint
CREATE INDEX `pv_visitor_id_idx` ON `page_views` (`visitor_id`);--> statement-breakpoint
CREATE INDEX `rec_product_id_idx` ON `product_recommendations` (`product_id`);--> statement-breakpoint
CREATE INDEX `pr_product_id_idx` ON `product_reviews` (`product_id`);--> statement-breakpoint
CREATE INDEX `pr_user_id_idx` ON `product_reviews` (`user_id`);--> statement-breakpoint
CREATE INDEX `products_category_id_idx` ON `products` (`category_id`);--> statement-breakpoint
CREATE INDEX `products_seller_id_idx` ON `products` (`seller_id`);--> statement-breakpoint
CREATE INDEX `products_status_idx` ON `products` (`status`);--> statement-breakpoint
CREATE INDEX `products_type_idx` ON `products` (`type`);--> statement-breakpoint
CREATE INDEX `products_created_at_idx` ON `products` (`created_at`);--> statement-breakpoint
CREATE INDEX `refunds_order_id_idx` ON `refunds` (`order_id`);--> statement-breakpoint
CREATE INDEX `refunds_status_idx` ON `refunds` (`status`);--> statement-breakpoint
CREATE INDEX `staff_user_id_idx` ON `staff` (`user_id`);--> statement-breakpoint
CREATE INDEX `staff_role_idx` ON `staff` (`role`);--> statement-breakpoint
CREATE INDEX `staff_email_idx` ON `staff` (`email`);--> statement-breakpoint
CREATE INDEX `st_product_id_idx` ON `stock_transfers` (`product_id`);--> statement-breakpoint
CREATE INDEX `st_status_idx` ON `stock_transfers` (`status`);--> statement-breakpoint
CREATE INDEX `um_user_id_idx` ON `user_memberships` (`user_id`);--> statement-breakpoint
CREATE INDEX `wi_user_id_idx` ON `wishlist_items` (`user_id`);--> statement-breakpoint
CREATE INDEX `wi_product_id_idx` ON `wishlist_items` (`product_id`);