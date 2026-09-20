/**
 * P4-02 迁移完整性校验
 *
 * 以 src/storage/database/shared/schema.ts(drizzle 定义)为基准,对比 DB_* 环境
 * 变量指向的数据库结构,输出:缺表、缺列、可空性/类型差异、缺失索引、库里多出的列。
 *
 * 两种用法:
 * 1. 指向"纯迁移链重放出来的库" → 校验迁移文件是否完整覆盖 schema.ts(CI 可用)
 * 2. 指向生产/预发库 → 校验真实库与代码的漂移
 *
 * 用法:pnpm tsx scripts/schema-integrity-check.ts
 * 退出码:缺表/缺列(硬漂移)非 0;仅类型/索引差异(软漂移)为 0 但会打印警告。
 */
import { getTableConfig, type MySqlTable } from 'drizzle-orm/mysql-core';
import { db } from '@/lib/db';
import * as schema from '@/storage/database/shared/schema';
import { buildDbIndexes, hasExactUniqueIndex } from './schema-integrity-rules';

interface DbColumn {
  table: string;
  column: string;
  columnType: string;
  nullable: boolean;
}

interface Finding {
  severity: 'MISSING_TABLE' | 'MISSING_COLUMN' | 'TYPE_DIFF' | 'NULLABILITY_DIFF' | 'MISSING_INDEX' | 'EXTRA_COLUMN';
  table: string;
  detail: string;
}

/** drizzle 的 getSQLType 与 information_schema.COLUMN_TYPE 的归一化比较 */
function normalizeType(t: string): string {
  return t
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/int\(\d+\)/, 'int') // MySQL 8.0.19+ 不再显示 int 显示宽度,统一去掉(含 tinyint(1))
    .replace(/^boolean$/, 'tinyint')
    .replace(/^serial$/, 'bigint unsigned') // drizzle serial = bigint unsigned auto_increment
    .trim();
}

async function main() {
  const findings: Finding[] = [];

  // ── 读取目标库结构 ──
  const [colRows] = await db.$client.execute(
    `SELECT TABLE_NAME as t, COLUMN_NAME as c, COLUMN_TYPE as ct, IS_NULLABLE as n
     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`
  );
  const dbColumns = new Map<string, Map<string, DbColumn>>();
  for (const r of colRows as Record<string, unknown>[]) {
    const table = String(r.t);
    if (!dbColumns.has(table)) dbColumns.set(table, new Map());
    dbColumns.get(table)!.set(String(r.c), {
      table,
      column: String(r.c),
      columnType: String(r.ct),
      nullable: String(r.n) === 'YES',
    });
  }

  const [idxRows] = await db.$client.execute(
    `SELECT TABLE_NAME as t, INDEX_NAME as i, NON_UNIQUE as nu,
            SEQ_IN_INDEX as seq, COLUMN_NAME as c
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`
  );
  const dbIndexDefinitions = buildDbIndexes(idxRows as Record<string, unknown>[]);
  const dbIndexes = new Map(
    [...dbIndexDefinitions].map(([tableName, indexes]) => [tableName, new Set(indexes.keys())]),
  );

  const [checkRows] = await db.$client.execute(
    `SELECT tc.TABLE_NAME AS t, tc.CONSTRAINT_NAME AS c
     FROM information_schema.TABLE_CONSTRAINTS tc
     JOIN information_schema.CHECK_CONSTRAINTS cc
       ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
      AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
     WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
       AND tc.TABLE_SCHEMA = DATABASE()
       AND tc.CONSTRAINT_TYPE = 'CHECK'`,
  );
  const dbCheckConstraints = new Map<string, Set<string>>();
  for (const row of checkRows as Array<Record<string, unknown>>) {
    const tableName = String(row.t);
    const constraintName = String(row.c);
    const names = dbCheckConstraints.get(tableName) ?? new Set<string>();
    names.add(constraintName);
    dbCheckConstraints.set(tableName, names);
  }

  // ── 遍历 schema.ts 的全部表 ──
  const tables = Object.values(schema).filter(
    (v) => typeof v === 'object' && v !== null && Symbol.for('drizzle:IsDrizzleTable') in (v as object)
  ) as unknown as MySqlTable[];

  let checkedTables = 0;
  let checkedColumns = 0;

  for (const table of tables) {
    const cfg = getTableConfig(table);
    checkedTables++;
    const dbTable = dbColumns.get(cfg.name);

    if (!dbTable) {
      findings.push({ severity: 'MISSING_TABLE', table: cfg.name, detail: `表不存在(schema.ts 有 ${cfg.columns.length} 列)` });
      continue;
    }

    for (const col of cfg.columns) {
      checkedColumns++;
      const dbCol = dbTable.get(col.name);
      if (!dbCol) {
        findings.push({
          severity: 'MISSING_COLUMN',
          table: cfg.name,
          detail: `${col.name} (${col.getSQLType()}${col.notNull ? ' NOT NULL' : ''})`,
        });
        continue;
      }
      const want = normalizeType(col.getSQLType());
      const got = normalizeType(dbCol.columnType);
      if (want !== got) {
        findings.push({ severity: 'TYPE_DIFF', table: cfg.name, detail: `${col.name}: schema=${want} db=${got}` });
      }
      if (col.notNull === dbCol.nullable && col.name !== 'id') {
        findings.push({
          severity: 'NULLABILITY_DIFF',
          table: cfg.name,
          detail: `${col.name}: schema ${col.notNull ? 'NOT NULL' : 'NULL'} / db ${dbCol.nullable ? 'NULL' : 'NOT NULL'}`,
        });
      }
    }

    // 库里存在但 schema.ts 没有的列(反向漂移,提示级)
    const schemaColNames = new Set(cfg.columns.map((c) => c.name));
    for (const dbColName of dbTable.keys()) {
      if (!schemaColNames.has(dbColName)) {
        findings.push({ severity: 'EXTRA_COLUMN', table: cfg.name, detail: dbColName });
      }
    }

    // 索引(按名字比对;主键/外键自动索引不检查)
    const dbIdx = dbIndexes.get(cfg.name) ?? new Set();
    for (const idx of cfg.indexes) {
      const idxName = idx.config.name;
      if (idxName && !dbIdx.has(idxName)) {
        findings.push({ severity: 'MISSING_INDEX', table: cfg.name, detail: idxName });
      }
    }
  }

  // ── 输出 ──
  const bySeverity = (s: Finding['severity']) => findings.filter((f) => f.severity === s);
  const order: Finding['severity'][] = ['MISSING_TABLE', 'MISSING_COLUMN', 'TYPE_DIFF', 'NULLABILITY_DIFF', 'MISSING_INDEX', 'EXTRA_COLUMN'];
  console.log(`\n扫描 ${checkedTables} 张表 / ${checkedColumns} 列,发现 ${findings.length} 项差异\n`);
  for (const sev of order) {
    const list = bySeverity(sev);
    if (list.length === 0) continue;
    console.log(`── ${sev} (${list.length}) ──`);
    for (const f of list) console.log(`  ${f.table}: ${f.detail}`);
    console.log('');
  }

  const hard = bySeverity('MISSING_TABLE').length + bySeverity('MISSING_COLUMN').length;
  if (hard > 0) {
    console.log(`✗ 硬漂移 ${hard} 项(缺表/缺列)——运行时随时可能炸,需要补迁移`);
    process.exit(1);
  }
  // ── POS 幂等键专项硬门禁 ──
  const posRequiredTables = [
    'pos_idempotency_keys', 'order_payments', 'orders', 'pos_operator_sessions',
    'pos_approval_tokens', 'pos_refund_items', 'pos_exchanges', 'staff',
    'pos_purchase_orders', 'pos_purchase_order_items',
    'pos_inventory_migration_exceptions', 'inventory', 'stock_transfers',
  ];
  const posRequiredColumns: Record<string, string[]> = {
    pos_idempotency_keys: ['idempotency_key', 'response_body'],
    order_payments: ['order_id', 'channel', 'method', 'amount', 'status'],
    orders: [
      'client_ref', 'refunded_total',
      'pickup_contact_name', 'pickup_phone', 'pickup_store_id', 'pickup_ready_at', 'picked_up_at',
      'staff_id', 'account_user_id',
    ],
    pos_operator_sessions: ['token_hash', 'account_user_id', 'staff_id', 'store_id', 'device_id', 'permissions', 'expires_at'],
    pos_approval_tokens: ['token_hash', 'operation', 'resource_hash', 'approved_by', 'store_id', 'expires_at', 'consumed_at'],
    pos_refund_items: ['id', 'refund_id', 'order_item_id', 'quantity', 'restock', 'created_at'],
    pos_exchanges: ['id', 'idempotency_key', 'store_id', 'original_order_id', 'replacement_order_id', 'refund_amount', 'new_order_amount', 'difference_amount', 'operator_id'],
    staff: ['pos_enabled', 'pos_pin_hash', 'pos_permissions', 'pos_pin_failed_attempts', 'pos_pin_last_failed_at', 'pos_pin_locked_until'],
    pos_purchase_orders: ['id', 'number', 'supplier', 'store_id', 'location_id', 'status', 'created_by', 'received_by', 'idempotency_key', 'created_at', 'received_at'],
    pos_purchase_order_items: ['id', 'purchase_order_id', 'product_id', 'variant_id', 'ordered_qty', 'received_qty', 'unit_cost'],
    pos_inventory_migration_exceptions: ['id', 'exception_type', 'product_id', 'variant_id', 'details', 'resolved_at', 'created_at'],
    inventory: ['variant_scope_key', 'store_scope_key', 'warehouse_scope_key'],
    stock_transfers: ['store_id'],
  };
  const posRequiredIndexes: Record<string, Record<string, string[]>> = {
    pos_idempotency_keys: {
      pos_idempotency_key_unique: ['idempotency_key'],
    },
    orders: {
      orders_client_ref_unique_idx: ['client_ref'],
    },
    pos_operator_sessions: {
      pos_operator_sessions_token_unique: ['token_hash'],
    },
    pos_approval_tokens: {
      pos_approval_tokens_token_unique: ['token_hash'],
    },
    pos_refund_items: {
      pos_refund_items_refund_item_unique: ['refund_id', 'order_item_id'],
    },
    pos_exchanges: {
      pos_exchanges_idempotency_unique: ['idempotency_key'],
    },
    pos_purchase_orders: {
      pos_purchase_orders_number_unique: ['number'],
      pos_purchase_orders_idempotency_unique: ['idempotency_key'],
    },
    inventory: {
      inventory_scope_unique: ['product_id', 'variant_scope_key', 'store_scope_key', 'warehouse_scope_key'],
    },
  };
  const posRequiredChecks: Record<string, string[]> = {
    pos_purchase_orders: [
      'pos_purchase_orders_status_check',
    ],
    pos_purchase_order_items: [
      'pos_purchase_order_items_ordered_qty_check',
      'pos_purchase_order_items_received_qty_check',
      'pos_purchase_order_items_unit_cost_check',
    ],
  };

  let posHardFailures = 0;
  for (const tableName of posRequiredTables) {
    // 检查表是否存在
    const tableExists = dbColumns.has(tableName);
    if (!tableExists) {
      console.error('✗ POS schema 门禁: 表 ' + tableName + ' 不存在');
      posHardFailures++;
      continue;
    }
    const dbTable = dbColumns.get(tableName)!;
    // 检查必需列
    for (const col of (posRequiredColumns[tableName] ?? [])) {
      if (!dbTable.has(col)) {
        console.error('✗ POS schema 门禁: 表 ' + tableName + ' 缺少列 ' + col);
        posHardFailures++;
      }
    }
    // 检查必需唯一索引
    for (const [idx, columns] of Object.entries(posRequiredIndexes[tableName] ?? {})) {
      if (!hasExactUniqueIndex(dbIndexDefinitions, tableName, idx, columns)) {
        console.error(
          '✗ POS schema 门禁: 表 ' + tableName + ' 缺少精确唯一索引 '
          + idx + ' (' + columns.join(', ') + ')',
        );
        posHardFailures++;
      }
    }
    for (const constraintName of (posRequiredChecks[tableName] ?? [])) {
      if (!dbCheckConstraints.get(tableName)?.has(constraintName)) {
        console.error(
          '✗ POS schema 门禁: 表 ' + tableName + ' 缺少 CHECK 约束 ' + constraintName,
        );
        posHardFailures++;
      }
    }
  }

  if (posHardFailures > 0) {
    console.error('✗ POS schema 门禁: ' + posHardFailures + ' 项失败');
    process.exit(1);
  }
  const [relationExceptionRows] = await db.$client.execute(
    `SELECT COUNT(*) AS count
     FROM pos_inventory_migration_exceptions
     WHERE exception_type IN ('PRODUCT_VARIANT_MISMATCH', 'STOCK_TOTAL_MISMATCH')
       AND resolved_at IS NULL`,
  );
  const unresolvedRelationExceptions = Number(
    (relationExceptionRows as Array<{ count: string | number }>)[0]?.count ?? 0,
  );
  if (unresolvedRelationExceptions > 0) {
    console.error(`POS schema gate: ${unresolvedRelationExceptions} unresolved inventory mismatch exception(s)`);
    process.exit(1);
  }
  console.log('✓ POS schema 门禁通过');

  console.log('✓ 无硬漂移(类型/索引差异见上,按需处理)');
  process.exit(0);
}

main().catch((e) => {
  console.error('校验脚本异常:', e);
  process.exit(2);
});
