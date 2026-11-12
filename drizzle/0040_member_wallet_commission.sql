-- Membership discount, wallet and affiliate commission go live, each with
-- validity periods (admin adjustable; program switches live in site_settings).
--
-- orders.total_amount stays "what the external payment collects"; the wallet
-- share of an order is orders.wallet_amount, so refunds through the payment
-- provider stay capped by what the provider took.
-- referrals.dedupe_key makes accrual / reversal idempotent per order / refund.
-- Every step is guarded so it can run on a database that already drifted.

SET @db = DATABASE();
--> statement-breakpoint

-- orders.member_tier_id
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'member_tier_id');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE orders ADD COLUMN member_tier_id VARCHAR(36) NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- orders.member_discount_amount
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'member_discount_amount');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE orders ADD COLUMN member_discount_amount DECIMAL(10,2) NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- orders.wallet_amount
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'wallet_amount');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE orders ADD COLUMN wallet_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- orders.affiliate_id
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'affiliate_id');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE orders ADD COLUMN affiliate_id VARCHAR(36) NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- membership_tiers.discount_starts_at
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'membership_tiers' AND COLUMN_NAME = 'discount_starts_at');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE membership_tiers ADD COLUMN discount_starts_at TIMESTAMP NULL DEFAULT NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- membership_tiers.discount_ends_at
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'membership_tiers' AND COLUMN_NAME = 'discount_ends_at');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE membership_tiers ADD COLUMN discount_ends_at TIMESTAMP NULL DEFAULT NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- user_memberships.assigned_tier_id
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'user_memberships' AND COLUMN_NAME = 'assigned_tier_id');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE user_memberships ADD COLUMN assigned_tier_id VARCHAR(36) NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- user_memberships.assigned_until
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'user_memberships' AND COLUMN_NAME = 'assigned_until');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE user_memberships ADD COLUMN assigned_until TIMESTAMP NULL DEFAULT NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- affiliates.commission_starts_at
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'affiliates' AND COLUMN_NAME = 'commission_starts_at');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE affiliates ADD COLUMN commission_starts_at TIMESTAMP NULL DEFAULT NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- affiliates.commission_ends_at
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'affiliates' AND COLUMN_NAME = 'commission_ends_at');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE affiliates ADD COLUMN commission_ends_at TIMESTAMP NULL DEFAULT NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- referrals.kind
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'referrals' AND COLUMN_NAME = 'kind');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE referrals ADD COLUMN kind VARCHAR(20) NOT NULL DEFAULT ''commission''', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- referrals.base_amount
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'referrals' AND COLUMN_NAME = 'base_amount');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE referrals ADD COLUMN base_amount DECIMAL(10,2) NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- referrals.available_at
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'referrals' AND COLUMN_NAME = 'available_at');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE referrals ADD COLUMN available_at TIMESTAMP NULL DEFAULT NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- referrals.matured_at
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'referrals' AND COLUMN_NAME = 'matured_at');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE referrals ADD COLUMN matured_at TIMESTAMP NULL DEFAULT NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- referrals.dedupe_key
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'referrals' AND COLUMN_NAME = 'dedupe_key');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE referrals ADD COLUMN dedupe_key VARCHAR(191) NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- orders.orders_affiliate_idx
SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'orders' AND INDEX_NAME = 'orders_affiliate_idx');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE orders ADD INDEX orders_affiliate_idx (affiliate_id)', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- referrals.referrals_dedupe_key_uq
SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'referrals' AND INDEX_NAME = 'referrals_dedupe_key_uq');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE referrals ADD UNIQUE INDEX referrals_dedupe_key_uq (dedupe_key)', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- referrals.referrals_maturity_idx
SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'referrals' AND INDEX_NAME = 'referrals_maturity_idx');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE referrals ADD INDEX referrals_maturity_idx (status, available_at)', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- payout / exit rows share the referrals table; tag them so commission
-- queries never pick them up (runs again harmlessly).
UPDATE referrals SET kind = 'payout' WHERE kind = 'commission' AND (order_id LIKE 'PAYOUT\\_%' OR order_id LIKE 'EXIT\\_%');
--> statement-breakpoint

-- wallet credits: each grant is a lot with its own expiry; spending takes
-- from the lots that expire first. Balance = unexpired, unrevoked remaining.
CREATE TABLE IF NOT EXISTS `wallet_credits` (
 `id` varchar(36) NOT NULL PRIMARY KEY,
 `user_id` varchar(36) NOT NULL,
 `amount` decimal(10,2) NOT NULL,
 `remaining` decimal(10,2) NOT NULL,
 `source` varchar(32) NOT NULL,
 `note` varchar(255) NULL,
 `order_id` varchar(36) NULL,
 `expires_at` timestamp NULL DEFAULT NULL,
 `revoked_at` timestamp NULL DEFAULT NULL,
 `created_by` varchar(36) NULL,
 `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY `wallet_credits_user_idx` (`user_id`, `expires_at`)
);
--> statement-breakpoint

-- wallet ledger: grant / debit / restore / revoke, one row per lot touched.
CREATE TABLE IF NOT EXISTS `wallet_transactions` (
 `id` varchar(36) NOT NULL PRIMARY KEY,
 `user_id` varchar(36) NOT NULL,
 `credit_id` varchar(36) NOT NULL,
 `order_id` varchar(36) NULL,
 `type` varchar(20) NOT NULL,
 `amount` decimal(10,2) NOT NULL,
 `note` varchar(255) NULL,
 `dedupe_key` varchar(191) NULL,
 `created_by` varchar(36) NULL,
 `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY `wallet_transactions_dedupe_uq` (`dedupe_key`),
 KEY `wallet_transactions_user_idx` (`user_id`, `created_at`),
 KEY `wallet_transactions_order_idx` (`order_id`)
);
