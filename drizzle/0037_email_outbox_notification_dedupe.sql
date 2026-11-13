-- TW-15: reliable email log / outbox and notification de-duplication.
--
-- email_logs previously had no body, so a failed email could not be resent
-- from its own record, and the application wrote non-existent columns
-- (recipient/body). Status values after this migration:
--   queued  = recorded, not yet handed to the provider (outbox)
--   sent    = provider accepted the message (NOT recipient delivery)
--   failed  = provider not configured / rejected / network error
-- Rows written before this migration keep their old status; they were
-- never handed to a provider by the legacy helper and have no body.
--
-- dedupe_key is unique per business event (e.g. order confirmation for one
-- order). NULL keys are not de-duplicated (manual retries, ad-hoc mail).
-- Every step is guarded so it can run on a database that already drifted.

SET @db = DATABASE();
--> statement-breakpoint

-- email_logs.body
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_logs' AND COLUMN_NAME = 'body');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE email_logs ADD COLUMN body MEDIUMTEXT NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- email_logs.content_type
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_logs' AND COLUMN_NAME = 'content_type');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE email_logs ADD COLUMN content_type VARCHAR(10) NOT NULL DEFAULT ''text''', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- email_logs.dedupe_key
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_logs' AND COLUMN_NAME = 'dedupe_key');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE email_logs ADD COLUMN dedupe_key VARCHAR(191) NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- email_logs.retry_of
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_logs' AND COLUMN_NAME = 'retry_of');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE email_logs ADD COLUMN retry_of VARCHAR(36) NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- email_logs.provider_message_id
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_logs' AND COLUMN_NAME = 'provider_message_id');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE email_logs ADD COLUMN provider_message_id VARCHAR(100) NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- email_logs.attempts
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_logs' AND COLUMN_NAME = 'attempts');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE email_logs ADD COLUMN attempts INT NOT NULL DEFAULT 0', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- email_logs.updated_at
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_logs' AND COLUMN_NAME = 'updated_at');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE email_logs ADD COLUMN updated_at TIMESTAMP NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- notifications.dedupe_key
SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'dedupe_key');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'ALTER TABLE notifications ADD COLUMN dedupe_key VARCHAR(191) NULL', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- email_logs index email_logs_dedupe_key_uq
SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_logs' AND INDEX_NAME = 'email_logs_dedupe_key_uq');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'CREATE UNIQUE INDEX email_logs_dedupe_key_uq ON email_logs (dedupe_key)', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- email_logs index email_logs_status_idx
SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'email_logs' AND INDEX_NAME = 'email_logs_status_idx');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'CREATE INDEX email_logs_status_idx ON email_logs (status, created_at)', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- notifications index notifications_dedupe_key_uq
SET @exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'notifications' AND INDEX_NAME = 'notifications_dedupe_key_uq');
--> statement-breakpoint
SET @sql = IF(@exists = 0, 'CREATE UNIQUE INDEX notifications_dedupe_key_uq ON notifications (dedupe_key)', 'SELECT "skip" AS s');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
