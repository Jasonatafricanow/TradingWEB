-- Migration: 0025 - Repair health_check table (P4 schema drift fix)
--
-- health_check was defined in 0000_legal_malcolm_colcord but never
-- materialized in production (migration chain was applied partially
-- before this project's schema-integrity scanner caught it).
--
-- This is a pure schema-fix migration: no business logic changes.
-- Definition matches 0000 exactly:
--   `id` serial AUTO_INCREMENT NOT NULL,
--   `updated_at` timestamp DEFAULT (now())
--
-- Effect: removes the sole hard-drift finding from
--   pnpm tsx scripts/schema-integrity-check.ts

CREATE TABLE IF NOT EXISTS `health_check` (
  `id` serial AUTO_INCREMENT NOT NULL,
  `updated_at` timestamp DEFAULT (now())
);
