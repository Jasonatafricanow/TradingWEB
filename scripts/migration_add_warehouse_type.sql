-- Migration: Add type column to warehouses table
-- 2026-05-21
-- type: 'warehouse' (default) or 'supplier'
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'warehouse';
