-- Migration: 0010 — 商品类型字典表
--
-- 创建 product_types 表，使 service / virtual / physical 等商品类型可在后台统一管理。
-- 配合 BUG-004 PR-4b：商品类型管理页。
-- 幂等：使用 information_schema 检测，避免重复执行。

SET @db = DATABASE();

SET @exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'product_types'
);

SET @sql = IF(@exists = 0, '
  CREATE TABLE product_types (
    id VARCHAR(36) NOT NULL DEFAULT (UUID()),
    code VARCHAR(64) NOT NULL,
    label VARCHAR(128) NOT NULL,
    label_en VARCHAR(128) DEFAULT NULL,
    description TEXT DEFAULT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active TINYINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT NULL,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_code (code),
    KEY idx_code (code),
    KEY idx_active (is_active),
    KEY idx_sort_order (sort_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
', 'SELECT "table already exists" AS status');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO product_types (code, label, label_en, description, sort_order) VALUES
  ('service', '咨询服务', 'Service', '咨询、顾问、会议等需要人工交付的服务型商品。', 1),
  ('virtual', '虚拟商品', 'Digital Product', '模板、课程、文件、下载链接等数字交付商品。', 2),
  ('physical', '实体商品', 'Physical Product', '需要库存、发货、物流履约的实物商品。', 3);
