-- Migration: 0009 - delivery methods dictionary
--
-- Creates delivery_methods so delivery options can be managed from admin.
-- Idempotent for repeated deployments.

CREATE TABLE IF NOT EXISTS delivery_methods (
  id VARCHAR(36) NOT NULL DEFAULT (UUID()),
  code VARCHAR(64) NOT NULL,
  label VARCHAR(128) NOT NULL,
  label_en VARCHAR(128) DEFAULT NULL,
  applicable_types JSON NOT NULL DEFAULT (JSON_ARRAY()),
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_code (code),
  KEY idx_code (code),
  KEY idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO delivery_methods (code, label, label_en, applicable_types, sort_order) VALUES
  ('online', '在线交付', 'Online Delivery', JSON_ARRAY('service', 'virtual'), 1),
  ('email', '邮件发送', 'Email Delivery', JSON_ARRAY('service', 'virtual'), 2),
  ('download', '下载链接', 'Download Link', JSON_ARRAY('virtual'), 3),
  ('meeting', '视频会议', 'Video Meeting', JSON_ARRAY('service'), 4),
  ('phone', '电话咨询', 'Phone Consultation', JSON_ARRAY('service'), 5),
  ('onsite', '上门服务', 'On-site Service', JSON_ARRAY('service'), 6),
  ('shipping', '物流发货', 'Shipping', JSON_ARRAY('physical'), 7);
