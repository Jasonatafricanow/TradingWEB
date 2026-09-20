-- Migration: 0005_affiliates_settings
-- Description: Create affiliates / referrals / site_settings tables that the
--              affiliate, payout, commission and maintenance-mode services
--              already query but were missing from previous Drizzle migrations.
-- Created: 2026-06-14
-- Author:  Frontend connectivity audit (JW)

-- ──────────────────────────────────────────────────────────────────────────
-- 1) affiliates — 推广者主表
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `affiliates` (
	`id`              varchar(36)   NOT NULL DEFAULT (UUID()),
	`user_id`         varchar(36)   NOT NULL,
	`email`           varchar(255)  DEFAULT NULL,
	`code`            varchar(50)   NOT NULL,
	`nickname`        varchar(100)  DEFAULT NULL,
	`rate`            decimal(5,2)  NOT NULL DEFAULT '5.00',
	`max_commission`  decimal(10,2) DEFAULT NULL,
	`min_payout`      decimal(10,2) NOT NULL DEFAULT '10.00',
	`status`          varchar(20)   NOT NULL DEFAULT 'pending', -- pending / active / suspended / deactivated
	`balance`         decimal(10,2) NOT NULL DEFAULT '0.00',
	`total_earned`    decimal(12,2) NOT NULL DEFAULT '0.00',
	`total_paid`      decimal(12,2) NOT NULL DEFAULT '0.00',
	`clicks`          int           NOT NULL DEFAULT 0,
	`conversions`     int           NOT NULL DEFAULT 0,
	`approved_by`     varchar(36)   DEFAULT NULL,
	`approved_at`     timestamp     NULL DEFAULT NULL,
	`exit_settlement` decimal(10,2) DEFAULT NULL,
	`exit_settled_at` timestamp     NULL DEFAULT NULL,
	`deactivated_at`  timestamp     NULL DEFAULT NULL,
	`created_at`      timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at`      timestamp     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliates_id`         PRIMARY KEY (`id`),
	CONSTRAINT `affiliates_code_uq`    UNIQUE       (`code`),
	CONSTRAINT `affiliates_user_id_uq` UNIQUE       (`user_id`)
);--> statement-breakpoint

CREATE INDEX `affiliates_email_idx`  ON `affiliates` (`email`);--> statement-breakpoint
CREATE INDEX `affiliates_status_idx` ON `affiliates` (`status`);--> statement-breakpoint

-- ──────────────────────────────────────────────────────────────────────────
-- 2) referrals — 推广记录 + 提现记录（order_id 用 PAYOUT_xxx / EXIT_xxx 区分）
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `referrals` (
	`id`           varchar(36)   NOT NULL DEFAULT (UUID()),
	`affiliate_id` varchar(36)   NOT NULL,
	`order_id`     varchar(255)  NOT NULL,
	`commission`   decimal(10,2) NOT NULL DEFAULT '0.00',
	`rate`         decimal(5,2)  NOT NULL DEFAULT '0.00',
	`status`       varchar(20)   NOT NULL DEFAULT 'pending', -- pending / approved / paid / cancelled
	`paid_at`      timestamp     NULL DEFAULT NULL,
	`created_at`   timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `referrals_id` PRIMARY KEY (`id`)
);--> statement-breakpoint

CREATE INDEX `referrals_affiliate_id_idx` ON `referrals` (`affiliate_id`);--> statement-breakpoint
CREATE INDEX `referrals_status_idx`       ON `referrals` (`status`);--> statement-breakpoint
CREATE INDEX `referrals_order_id_idx`     ON `referrals` (`order_id`);--> statement-breakpoint
CREATE INDEX `referrals_created_at_idx`   ON `referrals` (`created_at`);--> statement-breakpoint

-- ──────────────────────────────────────────────────────────────────────────
-- 3) site_settings — 站点级 key/value 配置（PayPal/Stripe 凭证、维护模式…）
--    NOTE: 列名 `key` 是 MySQL 保留字，建表 + 查询都要带反引号。
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `site_settings` (
	`key`        varchar(100) NOT NULL,
	`value`      text         DEFAULT NULL,
	`updated_at` timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `site_settings_key` PRIMARY KEY (`key`)
);
