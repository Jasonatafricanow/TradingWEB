-- Migration: 0028 - POS operator sessions and approval tokens
-- Raw tokens are returned once; only SHA-256 hashes are persisted.

SET @db = DATABASE();

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='staff' AND COLUMN_NAME='pos_enabled');
SET @sql = IF(@exists=0, 'ALTER TABLE staff ADD COLUMN pos_enabled BOOLEAN NOT NULL DEFAULT FALSE', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='staff' AND COLUMN_NAME='pos_pin_hash');
SET @sql = IF(@exists=0, 'ALTER TABLE staff ADD COLUMN pos_pin_hash VARCHAR(255) NULL', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='staff' AND COLUMN_NAME='pos_permissions');
SET @sql = IF(@exists=0, 'ALTER TABLE staff ADD COLUMN pos_permissions JSON NULL', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='staff' AND COLUMN_NAME='pos_pin_failed_attempts');
SET @sql = IF(@exists=0, 'ALTER TABLE staff ADD COLUMN pos_pin_failed_attempts INT NOT NULL DEFAULT 0', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='staff' AND COLUMN_NAME='pos_pin_last_failed_at');
SET @sql = IF(@exists=0, 'ALTER TABLE staff ADD COLUMN pos_pin_last_failed_at TIMESTAMP NULL', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='staff' AND COLUMN_NAME='pos_pin_locked_until');
SET @sql = IF(@exists=0, 'ALTER TABLE staff ADD COLUMN pos_pin_locked_until TIMESTAMP NULL', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @named_index = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'staff'
    AND INDEX_NAME = 'staff_pos_store_enabled_active_idx'
);
SET @exact_index = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'staff'
    AND INDEX_NAME = 'staff_pos_store_enabled_active_idx'
    AND NON_UNIQUE = 1
    AND (
      (SEQ_IN_INDEX = 1 AND COLUMN_NAME = 'store_id')
      OR (SEQ_IN_INDEX = 2 AND COLUMN_NAME = 'pos_enabled')
      OR (SEQ_IN_INDEX = 3 AND COLUMN_NAME = 'is_active')
    )
);
SET @sql = IF(
  @named_index > 0 AND NOT (@named_index = 3 AND @exact_index = 3),
  'DROP INDEX staff_pos_store_enabled_active_idx ON staff',
  'SELECT "skip" AS s'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exact_index = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'staff'
    AND INDEX_NAME = 'staff_pos_store_enabled_active_idx'
    AND NON_UNIQUE = 1
    AND (
      (SEQ_IN_INDEX = 1 AND COLUMN_NAME = 'store_id')
      OR (SEQ_IN_INDEX = 2 AND COLUMN_NAME = 'pos_enabled')
      OR (SEQ_IN_INDEX = 3 AND COLUMN_NAME = 'is_active')
    )
);
SET @sql = IF(@exact_index=0, 'CREATE INDEX staff_pos_store_enabled_active_idx ON staff (store_id, pos_enabled, is_active)', 'SELECT "skip" AS s');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS pos_operator_sessions (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  token_hash CHAR(64) NOT NULL,
  account_user_id VARCHAR(36) NOT NULL,
  staff_id VARCHAR(36) NOT NULL,
  store_id VARCHAR(36) NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  permissions JSON NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY pos_operator_sessions_token_unique (token_hash),
  INDEX pos_operator_sessions_staff_idx (staff_id, expires_at),
  INDEX pos_operator_sessions_device_idx (device_id, revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_approval_tokens (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  token_hash CHAR(64) NOT NULL,
  operation VARCHAR(40) NOT NULL,
  resource_hash CHAR(64) NOT NULL,
  approved_by VARCHAR(36) NOT NULL,
  store_id VARCHAR(36) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY pos_approval_tokens_token_unique (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
