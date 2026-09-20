export const QUERY_NAMES = [
  "database_identity",
  "server_version",
  "journal_rows",
  "tables",
  "columns",
  "indexes",
  "foreign_keys",
  "checks",
  "routines",
  "legacy_orders_missing_payment",
  "product_variant_mismatch",
  "stock_total_mismatch",
  "duplicate_inventory_scope",
  "unambiguous_backfill_missing",
  "ambiguous_location_exception_missing",
  "legacy_pos_attribution_missing",
] as const;

export type QueryName = (typeof QUERY_NAMES)[number];

export type QueryParameter = string | number | null;

export interface FixedQuery {
  sql: string;
  params: readonly QueryParameter[];
}

export const MYSQL_QUERIES: Record<QueryName, FixedQuery> = {
  database_identity: {
    sql: `SELECT DATABASE() AS database_name, @@server_uuid AS server_uuid`,
    params: [],
  },
  server_version: {
    sql: `SELECT VERSION() AS server_version`,
    params: [],
  },
  journal_rows: {
    sql: `SELECT CAST(id AS CHAR) AS id,
  hash,
  CAST(created_at AS CHAR) AS created_at
FROM __drizzle_migrations
ORDER BY CAST(created_at AS UNSIGNED), id`,
    params: [],
  },
  tables: {
    sql: `SELECT TABLE_NAME AS name,
  ENGINE AS engine,
  TABLE_COLLATION AS collation
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME`,
    params: [],
  },
  columns: {
    sql: `SELECT TABLE_NAME AS \`table\`,
  COLUMN_NAME AS name,
  ORDINAL_POSITION AS ordinal_position,
  COLUMN_TYPE AS column_type,
  IS_NULLABLE = 'YES' AS nullable,
  COLUMN_DEFAULT AS \`default\`,
  EXTRA AS extra,
  NULLIF(GENERATION_EXPRESSION, '') AS generation_expression,
  CHARACTER_SET_NAME AS character_set,
  COLLATION_NAME AS collation
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    params: [],
  },
  indexes: {
    sql: `SELECT TABLE_NAME AS \`table\`,
  INDEX_NAME AS name,
  NON_UNIQUE = 0 AS \`unique\`,
  INDEX_TYPE AS index_type,
  COLUMN_NAME AS column_name,
  SEQ_IN_INDEX AS seq_in_index,
  COLLATION AS collation,
  SUB_PART AS prefix_length
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
    params: [],
  },
  foreign_keys: {
    sql: `SELECT k.TABLE_NAME AS \`table\`,
  k.CONSTRAINT_NAME AS name,
  k.COLUMN_NAME AS column_name,
  k.ORDINAL_POSITION AS ordinal_position,
  k.REFERENCED_TABLE_NAME AS referenced_table,
  k.REFERENCED_COLUMN_NAME AS referenced_column,
  r.UPDATE_RULE AS on_update,
  r.DELETE_RULE AS on_delete
FROM information_schema.KEY_COLUMN_USAGE k
JOIN information_schema.REFERENTIAL_CONSTRAINTS r
  ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
 AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
 AND r.TABLE_NAME = k.TABLE_NAME
WHERE k.CONSTRAINT_SCHEMA = DATABASE()
  AND k.REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`,
    params: [],
  },
  checks: {
    sql: `SELECT tc.TABLE_NAME AS \`table\`,
  tc.CONSTRAINT_NAME AS name,
  cc.CHECK_CLAUSE AS clause
FROM information_schema.TABLE_CONSTRAINTS tc
JOIN information_schema.CHECK_CONSTRAINTS cc
  ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
 AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
  AND tc.CONSTRAINT_TYPE = 'CHECK'
ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_NAME`,
    params: [],
  },
  routines: {
    sql: `SELECT ROUTINE_NAME AS name,
  ROUTINE_TYPE AS type
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = DATABASE()
ORDER BY ROUTINE_NAME`,
    params: [],
  },
  legacy_orders_missing_payment: {
    sql: `SELECT COUNT(*) AS count
FROM orders o
WHERE o.payment_method IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM order_payments op WHERE op.order_id = o.id
  )`,
    params: [],
  },
  product_variant_mismatch: {
    sql: `SELECT COUNT(*) AS count
FROM (
  SELECT i.product_id, i.variant_id
  FROM inventory i
  LEFT JOIN product_variants v ON v.id = i.variant_id
  WHERE i.variant_id IS NOT NULL
    AND (v.id IS NULL OR v.product_id <> i.product_id)
  GROUP BY i.product_id, i.variant_id
) current_issue`,
    params: [],
  },
  stock_total_mismatch: {
    sql: `SELECT COUNT(*) AS count
FROM (
  SELECT v.product_id, v.id
  FROM product_variants v
  LEFT JOIN inventory i
    ON i.product_id = v.product_id
   AND i.variant_id = v.id
  GROUP BY v.product_id, v.id, v.stock
  HAVING COALESCE(SUM(i.stock), 0) <> v.stock
) current_issue`,
    params: [],
  },
  duplicate_inventory_scope: {
    sql: `SELECT COUNT(*) AS count
FROM (
  SELECT i.product_id,
    COALESCE(i.variant_id, '') AS variant_scope_key,
    COALESCE(i.store_id, '') AS store_scope_key,
    COALESCE(i.warehouse_id, '') AS warehouse_scope_key
  FROM inventory i
  GROUP BY i.product_id,
    COALESCE(i.variant_id, ''),
    COALESCE(i.store_id, ''),
    COALESCE(i.warehouse_id, '')
  HAVING COUNT(*) > 1
) duplicate_scope`,
    params: [],
  },
  unambiguous_backfill_missing: {
    sql: `SELECT COUNT(*) AS count
FROM product_variants v
WHERE (
  SELECT COUNT(*)
  FROM stores s
  JOIN warehouses w ON w.id = s.warehouse_id AND w.is_active = TRUE
  WHERE s.status = 'active' AND s.warehouse_id IS NOT NULL
) = 1
AND NOT EXISTS (
  SELECT 1
  FROM inventory i
  WHERE i.product_id = v.product_id AND i.variant_id = v.id
)`,
    params: [],
  },
  ambiguous_location_exception_missing: {
    sql: `SELECT COUNT(*) AS count
FROM product_variants v
WHERE v.stock > 0
  AND (
    SELECT COUNT(*)
    FROM stores s
    JOIN warehouses w ON w.id = s.warehouse_id AND w.is_active = TRUE
    WHERE s.status = 'active' AND s.warehouse_id IS NOT NULL
  ) <> 1
  AND NOT EXISTS (
    SELECT 1
    FROM inventory i
    WHERE i.product_id = v.product_id AND i.variant_id = v.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pos_inventory_migration_exceptions e
    WHERE e.exception_type = 'AMBIGUOUS_DEFAULT_LOCATION'
      AND e.resolved_at IS NULL
      AND e.product_id = v.product_id
      AND e.variant_id <=> v.id
  )`,
    params: [],
  },
  legacy_pos_attribution_missing: {
    sql: `SELECT COUNT(*) AS count
FROM orders o
WHERE o.source = 'pos'
  AND o.payment_id LIKE 'pos:%'
  AND (
    o.staff_id IS NULL
    OR o.staff_id <> SUBSTRING(o.payment_id, 5)
    OR CHAR_LENGTH(SUBSTRING(o.payment_id, 5)) NOT BETWEEN 1 AND 36
  )`,
    params: [],
  },
};
