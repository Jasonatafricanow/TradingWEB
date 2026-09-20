-- Logistics & Multi-Store: stores, shipments, shipment_items + store_id FKs
-- 在 0001_schema_improvements.sql 之后执行

-- ==================== 多店铺管理 ====================
--> statement-breakpoint
CREATE TABLE `stores` (
  `id` varchar(36) NOT NULL DEFAULT (UUID()),
  `name` varchar(100) NOT NULL,
  `slug` varchar(100),
  `type` varchar(20) NOT NULL DEFAULT 'permanent',
  `status` varchar(20) NOT NULL DEFAULT 'active',
  `warehouse_id` varchar(36),
  `contact_name` varchar(100),
  `contact_phone` varchar(50),
  `address_line1` varchar(200),
  `address_line2` varchar(200),
  `city` varchar(100),
  `state` varchar(100),
  `zip` varchar(20),
  `country` varchar(100) DEFAULT 'Moz',
  `open_time` varchar(10),
  `close_time` varchar(10),
  `open_at` timestamp,
  `close_at` timestamp,
  `metadata` json,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp,
  CONSTRAINT `stores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stores_slug_unique` ON `stores` (`slug`);
--> statement-breakpoint
CREATE INDEX `stores_slug_idx` ON `stores` (`slug`);
--> statement-breakpoint
CREATE INDEX `stores_type_idx` ON `stores` (`type`);
--> statement-breakpoint
CREATE INDEX `stores_status_idx` ON `stores` (`status`);

-- ==================== 物流/发货追踪 ====================
--> statement-breakpoint
CREATE TABLE `shipments` (
  `id` varchar(36) NOT NULL DEFAULT (UUID()),
  `order_id` varchar(36) NOT NULL,
  `store_id` varchar(36),
  `tracking_number` varchar(100),
  `carrier` varchar(100),
  `carrier_code` varchar(50),
  `status` varchar(30) NOT NULL DEFAULT 'pending',
  `shipping_method` varchar(100),
  `estimated_delivery` timestamp,
  `shipped_at` timestamp,
  `delivered_at` timestamp,
  `weight` decimal(10,2),
  `weight_unit` varchar(10) DEFAULT 'kg',
  `package_count` int DEFAULT 1,
  `notes` text,
  `tracking_events` json,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp,
  CONSTRAINT `shipments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ship_order_id_idx` ON `shipments` (`order_id`);
--> statement-breakpoint
CREATE INDEX `ship_store_id_idx` ON `shipments` (`store_id`);
--> statement-breakpoint
CREATE INDEX `ship_tracking_number_idx` ON `shipments` (`tracking_number`);
--> statement-breakpoint
CREATE INDEX `ship_status_idx` ON `shipments` (`status`);

--> statement-breakpoint
CREATE TABLE `shipment_items` (
  `id` varchar(36) NOT NULL DEFAULT (UUID()),
  `shipment_id` varchar(36) NOT NULL,
  `order_item_id` varchar(36) NOT NULL,
  `variant_id` varchar(36),
  `quantity` int NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `shipment_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `si_shipment_id_idx` ON `shipment_items` (`shipment_id`);
--> statement-breakpoint
CREATE INDEX `si_order_item_id_idx` ON `shipment_items` (`order_item_id`);

-- ==================== orders + store_id ====================
--> statement-breakpoint
ALTER TABLE `orders`
  ADD COLUMN `store_id` varchar(36);
--> statement-breakpoint
CREATE INDEX `orders_store_id_idx` ON `orders` (`store_id`);

-- ==================== staff + store_id ====================
--> statement-breakpoint
ALTER TABLE `staff`
  ADD COLUMN `store_id` varchar(36);
--> statement-breakpoint
CREATE INDEX `staff_store_id_idx` ON `staff` (`store_id`);

-- ==================== inventory + store_id ====================
--> statement-breakpoint
ALTER TABLE `inventory`
  ADD COLUMN `store_id` varchar(36);
--> statement-breakpoint
CREATE INDEX `inventory_store_id_idx` ON `inventory` (`store_id`);
