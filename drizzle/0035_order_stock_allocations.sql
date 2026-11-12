CREATE TABLE `order_stock_allocations` (
 `id` varchar(36) NOT NULL PRIMARY KEY,
 `order_id` varchar(36) NOT NULL,
 `inventory_id` varchar(36) NOT NULL,
 `product_id` varchar(36) NOT NULL,
 `variant_id` varchar(36),
 `quantity` int NOT NULL,
 `restored_quantity` int NOT NULL DEFAULT 0,
 KEY `stock_allocation_order_idx` (`order_id`)
);
