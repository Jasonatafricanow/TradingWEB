CREATE TABLE IF NOT EXISTS `import_session_images` (
  `session_id` varchar(36) NOT NULL,
  `image_id` varchar(36) NOT NULL,
  PRIMARY KEY (`session_id`, `image_id`)
);
