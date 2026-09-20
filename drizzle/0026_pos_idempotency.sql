-- Migration: 0026 - POS idempotency keys table
--
-- Creates the pos_idempotency_keys table for POS operation idempotency.
-- This enables safe retry of checkout, refund, exchange, stock_adjust,
-- receive, and shift_close operations without duplicate side effects.
--
-- The UNIQUE KEY on idempotency_key ensures at-most-once semantics:
--   1. First request inserts a 'processing' placeholder
--   2. If INSERT succeeds, the caller executes the work
--   3. On success the record is updated to 'completed' with the response
--   4. Subsequent same-key requests replay the completed response
--   5. Key reuse with different operation/storeId/requestHash -> 409
--   6. Concurrent duplicate-key losers re-read and follow the same rules

CREATE TABLE IF NOT EXISTS `pos_idempotency_keys` (
  `id` VARCHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  `idempotency_key` VARCHAR(160) NOT NULL,
  `operation` VARCHAR(40) NOT NULL,
  `store_id` VARCHAR(36) NULL,
  `request_hash` CHAR(64) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'processing',
  `response_status` INT NULL,
  `response_body` JSON NULL,
  `resource_type` VARCHAR(40) NULL,
  `resource_id` VARCHAR(36) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `expires_at` TIMESTAMP NULL,
  UNIQUE KEY `pos_idempotency_key_unique` (`idempotency_key`),
  INDEX `pos_idempotency_store_created_idx` (`store_id`, `created_at`),
  INDEX `pos_idempotency_status_idx` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
