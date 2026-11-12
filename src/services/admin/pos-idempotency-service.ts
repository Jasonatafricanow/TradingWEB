import { AsyncLocalStorage } from "node:async_hooks";
import type { DbTx } from "@/services/orders/order-pricing-service";
/**
 * POS 幂等键服务
 *
 * 提供通用幂等执行函数 runIdempotent<T>()，依靠数据库唯一索引保证并发安全：
 * 1. 先尝试 INSERT processing 占位
 * 2. 捕获 ER_DUP_ENTRY → 查询已有记录按规则处理
 * 3. 首次插入成功 → 执行 work，成功后 UPDATE completed
 * 4. 业务写入、响应及占位同事务提交；失败整体回滚。历史 processing 记录不盲删。
 */
import { db } from "@/lib/db";
import { posIdempotencyKeys } from "@/storage/database/shared/schema";
import { eq } from "drizzle-orm";

// Every production POS transaction joins the idempotency transaction, so the
// result and business ledger commit together. Historical processing rows stay closed.
const transactionContext = new AsyncLocalStorage<DbTx>();
export function posTransaction<T>(work: (tx: DbTx) => Promise<T>): Promise<T> {
  const current = transactionContext.getStore();
  return current ? work(current) : db.transaction(work);
}

// ==================== 类型定义 ====================

export interface IdempotencyInput {
  key: string;
  operation: "web_checkout" | "checkout" | "refund" | "exchange" | "stock_adjust" | "inventory_transfer" | "purchase_create" | "receive" | "shift_close";
  storeId: string | null;
  requestHash: string;
}

export interface IdempotencyCompletion<T> {
  responseStatus?: number;
  resourceType?: string | null;
  resourceId?: string | null | ((result: T) => string | null);
}

export class PosIdempotencyError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "PosIdempotencyError";
  }
}

// ==================== 查询类型 ====================

interface IdempotencyRecord {
  id: string;
  idempotency_key: string;
  operation: string;
  store_id: string | null;
  request_hash: string;
  status: string;
  response_status: number | null;
  response_body: unknown;
  resource_type: string | null;
  resource_id: string | null;
  created_at: Date;
  updated_at: Date;
  expires_at: Date | null;
}

function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const mysqlError = error as { errno?: number; code?: string; cause?: unknown };
  const cause = mysqlError.cause as { errno?: number; code?: string } | undefined;
  return mysqlError.errno === 1062 || mysqlError.code === "ER_DUP_ENTRY"
    || cause?.errno === 1062 || cause?.code === "ER_DUP_ENTRY";
}

// ==================== 执行函数 ====================

export async function runIdempotent<T>(
  input: IdempotencyInput,
  work: () => Promise<T>,
  completion: IdempotencyCompletion<T> = {},
): Promise<T> {
  let reserved = false;
  try {
    return await db.transaction(async tx => {
      await tx.insert(posIdempotencyKeys).values({
        idempotency_key: input.key, operation: input.operation, store_id: input.storeId,
        request_hash: input.requestHash, status: "processing",
      });
      reserved = true;
      const result = await transactionContext.run(tx, work);
      const resourceId = typeof completion.resourceId === "function" ? completion.resourceId(result) : completion.resourceId;
      await tx.update(posIdempotencyKeys).set({ status: "completed", response_status: completion.responseStatus ?? 200,
        response_body: result as unknown as Record<string, unknown>,
        ...(completion.resourceType !== undefined ? { resource_type: completion.resourceType } : {}),
        ...(resourceId !== undefined ? { resource_id: resourceId } : {}),
      }).where(eq(posIdempotencyKeys.idempotency_key, input.key));
      return result;
    });
  } catch (err: unknown) {
    // 检查是否为 duplicate key 错误
    if (!reserved && isDuplicateKeyError(err)) {
      // 重新读取已有记录
      const rows = await db.select()
        .from(posIdempotencyKeys)
        .where(eq(posIdempotencyKeys.idempotency_key, input.key))
        .limit(1);

      if (rows.length === 0) {
        // 理论上不应发生——insert 报 duplicate 但查不到
        throw new PosIdempotencyError(
          "Idempotency key conflict but no record found",
          "IDEMPOTENCY_KEY_REUSED",
          409,
        );
      }

      const record = rows[0] as unknown as IdempotencyRecord;

      // processing 冲突
      if (record.status === "processing") {
        throw new PosIdempotencyError(
          `Operation ${input.operation} is already in progress for key ${input.key}`,
          "IDEMPOTENCY_KEY_REUSED",
          409,
        );
      }

      // 已完成记录——校验字段一致性
      const storeIdMatch = (record.store_id ?? null) === (input.storeId ?? null);
      if (
        record.operation !== input.operation ||
        !storeIdMatch ||
        record.request_hash !== input.requestHash
      ) {
        throw new PosIdempotencyError(
          `Idempotency key ${input.key} was already used with different parameters`,
          "IDEMPOTENCY_KEY_REUSED",
          409,
        );
      }

      // 完全匹配——重放已保存响应
      if (record.status === "completed") {
        return record.response_body as T;
      }

      // 其他状态（不应发生，但防御性处理）
      throw new PosIdempotencyError(
        `Idempotency key ${input.key} is in unexpected state: ${record.status}`,
        "IDEMPOTENCY_KEY_REUSED",
        409,
      );
    }

    // 非 duplicate key 错误，向上透传
    throw err;
  }

}
