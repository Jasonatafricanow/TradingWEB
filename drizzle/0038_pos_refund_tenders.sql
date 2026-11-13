-- TW-10: how each POS refund was paid back (cash / card / ...), so a split
-- tender refund returns cash only for the cash share and shift close counts
-- exactly the cash that left the drawer. Kept apart from order_payments,
-- which receipts and reports read as sale tenders.
CREATE TABLE IF NOT EXISTS `pos_refund_tenders` (
 `id` varchar(36) NOT NULL PRIMARY KEY,
 `refund_id` varchar(36) NOT NULL,
 `order_id` varchar(36) NOT NULL,
 `method` varchar(64) NOT NULL,
 `label` varchar(100) NOT NULL,
 `amount` decimal(12,2) NOT NULL,
 `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY `pos_refund_tenders_refund_idx` (`refund_id`),
 KEY `pos_refund_tenders_order_idx` (`order_id`)
);
