CREATE TABLE `oauth_identities` (
  `id` varchar(36) NOT NULL PRIMARY KEY,
  `user_id` varchar(36) NOT NULL,
  `provider` varchar(20) NOT NULL,
  `subject` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `oauth_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  UNIQUE KEY `oauth_provider_subject_unique` (`provider`, `subject`),
  KEY `oauth_user_idx` (`user_id`)
);
