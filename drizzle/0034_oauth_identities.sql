-- oauth_user_fk needs user_id to use the same collation as users.id. users was
-- created with an explicit utf8mb4_unicode_ci (0003) while a new table takes the
-- database default (utf8mb4_0900_ai_ci on MySQL 8), so read the live collation.
SET @users_id_collation = (SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id');
--> statement-breakpoint
SET @sql = CONCAT(
  'CREATE TABLE `oauth_identities` (',
  '`id` varchar(36) NOT NULL PRIMARY KEY, ',
  '`user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE ', @users_id_collation, ' NOT NULL, ',
  '`provider` varchar(20) NOT NULL, ',
  '`subject` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, ',
  '`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, ',
  'CONSTRAINT `oauth_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`), ',
  'UNIQUE KEY `oauth_provider_subject_unique` (`provider`, `subject`), ',
  'KEY `oauth_user_idx` (`user_id`)',
  ')'
);
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
