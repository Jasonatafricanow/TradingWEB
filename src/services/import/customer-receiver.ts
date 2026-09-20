/**
 * Customer Receiver
 *
 * 接收 ImportCustomersEnvelope，按 record 写入 users + customer_addresses。
 * 走 external_source_mappings 幂等 UPSERT；二次推送同 source_id 会更新而非新建。
 *
 * 客户合并策略（避免邮箱冲突）：
 * - 同 source_id 二次推送 → 通过 mapping 找到本地 user，UPDATE 可变字段（不动 email）
 * - source_id 第一次见 → 先按 email 查现有 users；若 email 已存在则复用本地 user（认为是同一人在多店重复），只挂 mapping
 * - 真没有 → INSERT 新用户，password_hash=null（Shopify 历史客户，无密码可登录）
 *
 * 地址同步策略（v1 简化）：
 * - 只在首次创建用户时插入地址；已有用户不重复插（避免 N 次同步累积重复）
 * - 后续要做"按 source_id 跟踪每个地址"再加 address_source_id 概念
 */
import { db } from "@/lib/db";
import {
  users,
  customerAddresses,
  importSessions,
  importJobs,
} from "@/storage/database/shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { ValidationError } from "@/lib/errors";
import type {
  ImportCustomersEnvelope,
  ImportCustomerRecord,
  ImportBatchResult,
  ImportRecordError,
} from "@/types/import-contract";
import { findMapping, upsertMapping } from "./source-mapping";
import { validateCustomers } from "./validator";
import type { ReceiverContext } from "./product-receiver";
import { refreshImportSessionStatus } from "./session-service";

const SOURCE_TYPE_CUSTOMER = "customer";
const SOURCE_TYPE_ADDRESS = "address";

export interface ReceiveCustomersOptions {
  dryRun?: boolean;
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return rows[0]?.id ?? null;
}

function buildDisplayName(record: ImportCustomerRecord): string | null {
  const name = [record.first_name, record.last_name].filter(Boolean).join(" ").trim();
  return name === "" ? null : name;
}

async function upsertCustomerUser(
  ctx: ReceiverContext,
  record: ImportCustomerRecord,
): Promise<string> {
  const mapping = await findMapping({
    source: ctx.source,
    source_store: ctx.source_store,
    source_type: SOURCE_TYPE_CUSTOMER,
    source_id: record.source_id,
  });

  let userId: string;
  if (mapping) {
    userId = mapping.local_id;
    await db
      .update(users)
      .set({
        name: buildDisplayName(record),
        phone: record.phone ?? null,
        updated_at: new Date(),
      })
      .where(eq(users.id, userId));
  } else {
    const existingByEmail = await findUserIdByEmail(record.email);
    if (existingByEmail) {
      // 跨 store 合并或重导：复用本地用户
      userId = existingByEmail;
    } else {
      userId = randomUUID();
      await db.insert(users).values({
        id: userId,
        email: record.email,
        name: buildDisplayName(record),
        phone: record.phone ?? null,
        password_hash: null,
        is_active: true,
      });
    }
  }

  await upsertMapping(
    {
      source: ctx.source,
      source_store: ctx.source_store,
      source_type: SOURCE_TYPE_CUSTOMER,
      source_id: record.source_id,
    },
    { table: "users", id: userId },
    record,
  );

  return userId;
}

async function syncCustomerAddresses(
  ctx: ReceiverContext,
  userId: string,
  record: ImportCustomerRecord,
): Promise<void> {
  if (!record.addresses || record.addresses.length === 0) return;

  // v1：用户已有地址则跳过，避免重复插入
  const existing = await db
    .select({ id: customerAddresses.id })
    .from(customerAddresses)
    .where(eq(customerAddresses.user_id, userId))
    .limit(1);
  if (existing.length > 0) return;

  for (let i = 0; i < record.addresses.length; i++) {
    const addr = record.addresses[i];
    // schema 要求 address_line1 + city 必填，缺就跳过这一条
    if (!addr.address1 || !addr.city) continue;

    const id = randomUUID();
    await db.insert(customerAddresses).values({
      id,
      user_id: userId,
      first_name: addr.first_name ?? null,
      last_name: addr.last_name ?? null,
      company: addr.company ?? null,
      phone: addr.phone ?? null,
      address_line1: addr.address1,
      address_line2: addr.address2 ?? null,
      city: addr.city,
      state: addr.province ?? null,
      zip: addr.zip ?? null,
      country: addr.country ?? "Moz",
      is_default: addr.is_default ?? i === 0,
    });

    await upsertMapping(
      {
        source: ctx.source,
        source_store: ctx.source_store,
        source_type: SOURCE_TYPE_ADDRESS,
        source_id: `${record.source_id}:address:${i}`,
      },
      { table: "customer_addresses", id },
      addr,
    );
  }
}

export async function receiveCustomers(
  ctx: ReceiverContext,
  envelope: ImportCustomersEnvelope,
  opts: ReceiveCustomersOptions = {},
): Promise<ImportBatchResult> {
  if (envelope.source !== ctx.source || envelope.source_store !== ctx.source_store) {
    throw new ValidationError(
      `envelope source/source_store 和 session 不匹配：envelope=${envelope.source}/${envelope.source_store}，session=${ctx.source}/${ctx.source_store}`,
    );
  }

  const errors: ImportRecordError[] = [...validateCustomers(envelope)];
  const invalidIndices = new Set<number>();
  for (const e of errors) {
    if (e.code === "VALIDATION_FAILED" || e.code === "DUPLICATE_SOURCE_ID") {
      invalidIndices.add(e.record_index);
    }
  }

  if (opts.dryRun) {
    return {
      ok: errors.length === 0,
      job_type: "customers",
      total: envelope.records.length,
      success: envelope.records.length - invalidIndices.size,
      failed: invalidIndices.size,
      errors,
    };
  }

  const jobId = randomUUID();
  await db.insert(importJobs).values({
    id: jobId,
    session_id: ctx.session_id,
    job_type: "customers",
    status: "running",
    total_rows: envelope.records.length,
  });
  await db
    .update(importSessions)
    .set({ status: "running", finished_at: null })
    .where(eq(importSessions.id, ctx.session_id));

  let success = 0;
  let failed = invalidIndices.size;

  for (let i = 0; i < envelope.records.length; i++) {
    if (invalidIndices.has(i)) continue;
    const record = envelope.records[i];
    try {
      const userId = await upsertCustomerUser(ctx, record);
      await syncCustomerAddresses(ctx, userId, record);
      success++;
    } catch (e) {
      failed++;
      errors.push({
        record_index: i,
        source_id: record.source_id,
        code: "INTERNAL_ERROR",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const allOk = failed === 0;
  await db
    .update(importJobs)
    .set({
      status: allOk ? "completed" : "failed",
      success_rows: success,
      failed_rows: failed,
      errors: errors.length > 0 ? (errors as never) : null,
      finished_at: new Date(),
    })
    .where(eq(importJobs.id, jobId));

  await refreshImportSessionStatus(ctx.session_id);

  return {
    ok: allOk,
    session_id: ctx.session_id,
    job_type: "customers",
    total: envelope.records.length,
    success,
    failed,
    errors,
  };
}
