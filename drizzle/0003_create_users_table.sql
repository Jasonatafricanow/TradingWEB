-- Migration: 0003_create_users_table
-- Description: Idempotently create the local JWT users table and backfill from profiles when present.
-- Created: 2026-05-21

CREATE TABLE IF NOT EXISTS `users` (
  `id` varchar(36) NOT NULL PRIMARY KEY,
  `email` varchar(255) NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `avatar_url` varchar(500) DEFAULT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `is_active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `users_email_unique` (`email`),
  KEY `users_email_idx` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @profiles_exists := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'profiles'
);

SET @backfill_users_sql := IF(
  @profiles_exists > 0,
  'INSERT IGNORE INTO `users` (`id`, `email`, `name`) SELECT `id`, `email`, `display_name` FROM `profiles` WHERE `email` IS NOT NULL AND `email` != ''''',
  'SELECT 1'
);

PREPARE backfill_users_stmt FROM @backfill_users_sql;
EXECUTE backfill_users_stmt;
DEALLOCATE PREPARE backfill_users_stmt;
