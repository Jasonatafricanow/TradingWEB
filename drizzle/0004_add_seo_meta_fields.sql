-- Migration: 0004_add_seo_meta_fields
-- Description: Idempotently add SEO meta fields to products.
-- Created: 2026-05-24

SET @has_meta_title := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'products'
    AND column_name = 'meta_title'
);

SET @add_meta_title_sql := IF(
  @has_meta_title = 0,
  'ALTER TABLE `products` ADD COLUMN `meta_title` varchar(200) DEFAULT NULL AFTER `delivery_method`',
  'SELECT 1'
);

PREPARE add_meta_title_stmt FROM @add_meta_title_sql;
EXECUTE add_meta_title_stmt;
DEALLOCATE PREPARE add_meta_title_stmt;

SET @has_meta_description := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'products'
    AND column_name = 'meta_description'
);

SET @add_meta_description_sql := IF(
  @has_meta_description = 0,
  'ALTER TABLE `products` ADD COLUMN `meta_description` text DEFAULT NULL AFTER `meta_title`',
  'SELECT 1'
);

PREPARE add_meta_description_stmt FROM @add_meta_description_sql;
EXECUTE add_meta_description_stmt;
DEALLOCATE PREPARE add_meta_description_stmt;
