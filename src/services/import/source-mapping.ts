/**
 * external_source_mappings 通用 CRUD
 *
 * 用于追踪外部源（Shopify/Woo/Magento）原始 ID 和 tradingWEB 本地 record 的对应关系。
 * 所有 receiver（products/customers/orders）在写入本地表后必须调 upsertMapping 留下交叉引用。
 * 二次同源导入靠 unique key (source, source_store, source_type, source_id) 自然 UPSERT。
 */
import { db } from "@/lib/db";
import { externalSourceMappings } from "@/storage/database/shared/schema";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { ImportSource } from "@/types/import-contract";

/** db.transaction 的 tx 也能用，故声明宽类型 */
export type DbLike = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface MappingKey {
  source: ImportSource;
  source_store: string;
  source_type: string;
  source_id: string;
}

export interface MappingLookup {
  local_table: string;
  local_id: string;
}

/** 单条查询；找不到返回 null */
export async function findMapping(
  key: MappingKey,
  dbLike: DbLike = db
): Promise<MappingLookup | null> {
  const rows = await dbLike
    .select({
      local_table: externalSourceMappings.local_table,
      local_id: externalSourceMappings.local_id,
    })
    .from(externalSourceMappings)
    .where(
      and(
        eq(externalSourceMappings.source, key.source),
        eq(externalSourceMappings.source_store, key.source_store),
        eq(externalSourceMappings.source_type, key.source_type),
        eq(externalSourceMappings.source_id, key.source_id),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** 批量查询，按 source_id 索引；找不到的 key 不会出现在返回 Map 里 */
export async function bulkFindMappings(
  source: ImportSource,
  source_store: string,
  source_type: string,
  source_ids: string[],
  dbLike: DbLike = db,
): Promise<Map<string, MappingLookup>> {
  const result = new Map<string, MappingLookup>();
  if (source_ids.length === 0) return result;

  const rows = await dbLike
    .select({
      source_id: externalSourceMappings.source_id,
      local_table: externalSourceMappings.local_table,
      local_id: externalSourceMappings.local_id,
    })
    .from(externalSourceMappings)
    .where(
      and(
        eq(externalSourceMappings.source, source),
        eq(externalSourceMappings.source_store, source_store),
        eq(externalSourceMappings.source_type, source_type),
        inArray(externalSourceMappings.source_id, source_ids),
      ),
    );

  for (const r of rows) {
    result.set(r.source_id, { local_table: r.local_table, local_id: r.local_id });
  }
  return result;
}

/**
 * 幂等 UPSERT 映射。
 * 走 unique key (source, source_store, source_type, source_id)：存在则更新 local_table / local_id / raw_snapshot；不存在则插入。
 * raw_snapshot 传 null 时会覆盖旧快照——receiver 推送时应总是带上当前 envelope。
 */
export async function upsertMapping(
  key: MappingKey,
  local: { table: string; id: string },
  raw_snapshot: unknown = null,
  dbLike: DbLike = db,
): Promise<void> {
  await dbLike
    .insert(externalSourceMappings)
    .values({
      id: randomUUID(),
      source: key.source,
      source_store: key.source_store,
      source_type: key.source_type,
      source_id: key.source_id,
      local_table: local.table,
      local_id: local.id,
      raw_snapshot: raw_snapshot as never,
    })
    .onDuplicateKeyUpdate({
      set: {
        local_table: local.table,
        local_id: local.id,
        raw_snapshot: raw_snapshot as never,
        updated_at: new Date(),
      },
    });
}
