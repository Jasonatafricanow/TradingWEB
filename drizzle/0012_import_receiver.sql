-- Migration: 0012 - generic import receiver
--
-- Adds the receiver-side schema for MoveShopify and future migration senders:
-- import_sessions, import_jobs, external_source_mappings, plus async image
-- mirroring fields on product_images.

SET @db = DATABASE();
--> statement-breakpoint

-- product_images.original_url
SET @exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'product_images'
    AND COLUMN_NAME = 'original_url'
);
--> statement-breakpoint
SET @sql = IF(
  @exists = 0,
  'ALTER TABLE product_images ADD COLUMN original_url VARCHAR(2048) NULL AFTER src',
  'SELECT "product_images.original_url already exists" AS status'
);
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- product_images.mirror_status
SET @exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'product_images'
    AND COLUMN_NAME = 'mirror_status'
);
--> statement-breakpoint
SET @sql = IF(
  @exists = 0,
  'ALTER TABLE product_images ADD COLUMN mirror_status VARCHAR(20) NOT NULL DEFAULT ''pending'' AFTER original_url',
  'SELECT "product_images.mirror_status already exists" AS status'
);
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- product_images.mirrored_at
SET @exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'product_images'
    AND COLUMN_NAME = 'mirrored_at'
);
--> statement-breakpoint
SET @sql = IF(
  @exists = 0,
  'ALTER TABLE product_images ADD COLUMN mirrored_at TIMESTAMP NULL AFTER mirror_status',
  'SELECT "product_images.mirrored_at already exists" AS status'
);
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- Existing local images were not created from external URLs, so mark them mirrored.
UPDATE product_images
SET mirror_status = 'mirrored',
    mirrored_at = COALESCE(mirrored_at, created_at)
WHERE original_url IS NULL
  AND mirror_status = 'pending';
--> statement-breakpoint

-- Worker lookup index for pending mirrors.
SET @exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'product_images'
    AND INDEX_NAME = 'pi_mirror_status_idx'
);
--> statement-breakpoint
SET @sql = IF(
  @exists = 0,
  'ALTER TABLE product_images ADD INDEX pi_mirror_status_idx (mirror_status)',
  'SELECT "pi_mirror_status_idx already exists" AS status'
);
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS import_sessions (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()),
  source VARCHAR(50) NOT NULL,
  source_store VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  expected_jobs JSON DEFAULT NULL,
  customer_link_strategy VARCHAR(30) NOT NULL DEFAULT 'auto_create_user',
  started_by VARCHAR(36) DEFAULT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY is_source_idx (source, source_store, started_at),
  KEY is_status_idx (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS import_jobs (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()),
  session_id VARCHAR(36) NOT NULL,
  job_type VARCHAR(50) NOT NULL,
  total_rows INT NOT NULL DEFAULT 0,
  success_rows INT NOT NULL DEFAULT 0,
  failed_rows INT NOT NULL DEFAULT 0,
  errors JSON DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY ij_session_idx (session_id),
  KEY ij_status_idx (status),
  KEY ij_type_idx (job_type),
  CONSTRAINT import_jobs_session_fk
    FOREIGN KEY (session_id) REFERENCES import_sessions(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS external_source_mappings (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()),
  source VARCHAR(50) NOT NULL,
  source_store VARCHAR(100) NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  source_id VARCHAR(255) NOT NULL,
  local_table VARCHAR(50) NOT NULL,
  local_id VARCHAR(36) NOT NULL,
  raw_snapshot JSON DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY esm_source_unique_idx (source, source_store, source_type, source_id),
  KEY esm_local_idx (local_table, local_id),
  KEY esm_source_idx (source, source_store)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;