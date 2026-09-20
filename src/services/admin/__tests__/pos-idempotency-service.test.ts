/**
 * POS 幂等键服务单元测试（TDD RED）
 *
 * 验证 runIdempotent 的并发安全和幂等语义：
 * - 依赖数据库唯一索引保证 at-most-once
 * - 相同 key + 相同 hash 重放已完成响应
 * - 相同 key + 不同 hash/operation/storeId 返回 409
 * - processing 冲突不重复执行 work
 * - 并发 duplicate key 重读规则
 * - work 失败保留 processing 占位
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runIdempotent, PosIdempotencyError, type IdempotencyInput } from "../pos-idempotency-service";

// ---- Mock 数据库模块 ----
// vi.hoisted 确保在 vi.mock 提升前执行
const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    $client: {
      execute: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

// ---- Helper ----
function makeInput(overrides: Partial<IdempotencyInput> = {}): IdempotencyInput {
  return {
    key: "idem-ck-001",
    operation: "checkout",
    storeId: "store-001",
    requestHash: "abc123def456",
    ...overrides,
  };
}

function makeCompletedRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "rec-001",
    idempotency_key: "idem-ck-001",
    operation: "checkout",
    store_id: "store-001",
    request_hash: "abc123def456",
    status: "completed",
    response_status: 200,
    response_body: { orderId: "order-999", total: 49.99 },
    resource_type: null,
    resource_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    expires_at: null,
    ...overrides,
  };
}

function makeProcessingRecord(overrides: Record<string, unknown> = {}) {
  return makeCompletedRecord({ status: "processing", response_body: null, response_status: null, ...overrides });
}

/**
 * 创建 Drizzle 风格的链式 mock
 * .from().where() 返回 { limit: fn }，其中 limit() 返回 rows
 */
function makeSelectChain(rows: unknown[]) {
  const limitMock = vi.fn().mockResolvedValue(rows);
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  return { from: fromMock, where: whereMock, limit: limitMock };
}

/** 创建 insert chain mock */
function makeInsertChain(resolveValue?: unknown, rejectValue?: Error) {
  const valuesMock = rejectValue
    ? vi.fn().mockRejectedValue(rejectValue)
    : vi.fn().mockResolvedValue(resolveValue ?? [{ insertId: 1 }]);
  return { values: valuesMock };
}

/** 创建 update chain mock */
function makeUpdateChain() {
  const whereMock = vi.fn().mockResolvedValue(undefined);
  const setMock = vi.fn(() => ({ where: whereMock }));
  return { set: setMock, where: whereMock };
}

/** 创建一个 duplicate key 错误 */
function makeDupError(): Error {
  const err = new Error("Duplicate entry");
  const mysqlError = err as Error & { errno: number; code: string };
  mysqlError.errno = 1062;
  mysqlError.code = "ER_DUP_ENTRY";
  return err;
}

function makeDrizzleDuplicateQueryError(): Error {
  const err = new Error("Failed query") as Error & { cause: Error };
  err.cause = makeDupError();
  return err;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runIdempotent", () => {
  // ---- 场景 1：首次执行 ----
  it("场景1: 首次执行保存结果，第二次返回相同结果，work 只调用一次", async () => {
    // 首次：insert 成功
    const insertChain = makeInsertChain();
    const selectChain = makeSelectChain([]);
    const updateChain = makeUpdateChain();

    mockDb.insert.mockReturnValue(insertChain);
    mockDb.select.mockReturnValue(selectChain);
    mockDb.update.mockReturnValue(updateChain);

    const workFn = vi.fn().mockResolvedValue({ orderId: "order-999", total: 49.99 });

    const result1 = await runIdempotent(makeInput(), workFn);
    expect(result1).toEqual({ orderId: "order-999", total: 49.99 });
    expect(workFn).toHaveBeenCalledTimes(1);
    expect(insertChain.values).toHaveBeenCalledTimes(1);
    expect(updateChain.set).toHaveBeenCalledWith({
      status: "completed",
      response_status: 200,
      response_body: { orderId: "order-999", total: 49.99 },
    });
    expect(updateChain.where).toHaveBeenCalledTimes(1);

    // 第二次：duplicate key -> 查询 -> 返回已完成结果
    vi.clearAllMocks();
    const insertChain2 = makeInsertChain(undefined, makeDupError());
    const selectChain2 = makeSelectChain([makeCompletedRecord()]);

    mockDb.insert.mockReturnValue(insertChain2);
    mockDb.select.mockReturnValue(selectChain2);

    const workFn2 = vi.fn().mockResolvedValue({ shouldNotBeCalled: true });

    const result2 = await runIdempotent(makeInput(), workFn2);
    expect(result2).toEqual({ orderId: "order-999", total: 49.99 });
    expect(workFn2).not.toHaveBeenCalled();
    expect(selectChain2.from).toHaveBeenCalled();
  });

  it("replays a completed response when Drizzle wraps a duplicate key error", async () => {
    const insertChain = makeInsertChain(undefined, makeDrizzleDuplicateQueryError());
    const selectChain = makeSelectChain([makeCompletedRecord()]);
    mockDb.insert.mockReturnValue(insertChain);
    mockDb.select.mockReturnValue(selectChain);
    const workFn = vi.fn().mockResolvedValue({ shouldNotBeCalled: true });

    await expect(runIdempotent(makeInput(), workFn)).resolves.toEqual({ orderId: "order-999", total: 49.99 });
    expect(workFn).not.toHaveBeenCalled();
  });

  it("保存调用方提供的响应状态和资源元数据", async () => {
    const insertChain = makeInsertChain();
    const updateChain = makeUpdateChain();
    mockDb.insert.mockReturnValue(insertChain);
    mockDb.update.mockReturnValue(updateChain);

    await runIdempotent<{ id: string; total: string }>(
      makeInput(),
      vi.fn().mockResolvedValue({ id: "order-999", total: "49.99" }),
      {
        responseStatus: 201,
        resourceType: "order",
        resourceId: (result) => result.id,
      },
    );

    expect(updateChain.set).toHaveBeenCalledWith({
      status: "completed",
      response_status: 201,
      response_body: { id: "order-999", total: "49.99" },
      resource_type: "order",
      resource_id: "order-999",
    });
  });

  // ---- 场景 2：同 key 不同 requestHash ----
  it("场景2: 相同 key 不同 requestHash 返回 409", async () => {
    const insertChain = makeInsertChain(undefined, makeDupError());
    const selectChain = makeSelectChain([makeCompletedRecord({ request_hash: "original_hash" })]);

    mockDb.insert.mockReturnValue(insertChain);
    mockDb.select.mockReturnValue(selectChain);

    await expect(
      runIdempotent(makeInput({ requestHash: "different_hash" }), vi.fn())
    ).rejects.toThrow(PosIdempotencyError);

    await expect(
      runIdempotent(makeInput({ requestHash: "different_hash" }), vi.fn())
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      status: 409,
    });
  });

  // ---- 场景 3：同 key 不同 operation ----
  it("场景3: 相同 key 不同 operation 返回 409", async () => {
    const insertChain = makeInsertChain(undefined, makeDupError());
    const selectChain = makeSelectChain([makeCompletedRecord({ operation: "refund" })]);

    mockDb.insert.mockReturnValue(insertChain);
    mockDb.select.mockReturnValue(selectChain);

    await expect(
      runIdempotent(makeInput({ operation: "checkout" }), vi.fn())
    ).rejects.toThrow(PosIdempotencyError);

    await expect(
      runIdempotent(makeInput({ operation: "checkout" }), vi.fn())
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      status: 409,
    });
  });

  // ---- 场景 4：同 key 不同 storeId ----
  it("场景4: 相同 key 不同 storeId 返回 409", async () => {
    const insertChain = makeInsertChain(undefined, makeDupError());
    const selectChain = makeSelectChain([makeCompletedRecord({ store_id: "store-other" })]);

    mockDb.insert.mockReturnValue(insertChain);
    mockDb.select.mockReturnValue(selectChain);

    await expect(
      runIdempotent(makeInput({ storeId: "store-001" }), vi.fn())
    ).rejects.toThrow(PosIdempotencyError);

    await expect(
      runIdempotent(makeInput({ storeId: "store-001" }), vi.fn())
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      status: 409,
    });
  });

  // ---- 场景 5：processing 冲突 ----
  it("场景5: 已有 processing 记录返回 409，work 不执行", async () => {
    const insertChain = makeInsertChain(undefined, makeDupError());
    const selectChain = makeSelectChain([makeProcessingRecord()]);

    mockDb.insert.mockReturnValue(insertChain);
    mockDb.select.mockReturnValue(selectChain);
    const workFn = vi.fn();

    await expect(
      runIdempotent(makeInput(), workFn)
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      status: 409,
    });
    expect(workFn).not.toHaveBeenCalled();
  });

  // ---- 场景 6：并发唯一索引竞争 ----
  it("场景6: 两请求争抢唯一索引，duplicate key 方重读记录", async () => {
    // 第一个请求：insert 成功
    const insertChain1 = makeInsertChain();
    const selectChain1 = makeSelectChain([]);
    const updateChain1 = makeUpdateChain();

    mockDb.insert.mockReturnValue(insertChain1);
    mockDb.select.mockReturnValue(selectChain1);
    mockDb.update.mockReturnValue(updateChain1);

    const workFn1 = vi.fn().mockResolvedValue({ orderId: "order-999" });
    const result1 = await runIdempotent(makeInput(), workFn1);
    expect(result1).toEqual({ orderId: "order-999" });
    expect(workFn1).toHaveBeenCalledTimes(1);

    // 第二个请求：duplicate key 竞争
    vi.clearAllMocks();
    const insertChain2 = makeInsertChain(undefined, makeDupError());
    const selectChain2 = makeSelectChain([
      makeCompletedRecord({ status: "completed", response_body: { orderId: "order-999" } }),
    ]);

    mockDb.insert.mockReturnValue(insertChain2);
    mockDb.select.mockReturnValue(selectChain2);

    const workFn2 = vi.fn().mockResolvedValue({ duplicateWork: true });
    const result2 = await runIdempotent(makeInput({ key: "idem-ck-001" }), workFn2);

    expect(result2).toEqual({ orderId: "order-999" });
    expect(workFn2).not.toHaveBeenCalled();
    expect(selectChain2.from).toHaveBeenCalled();
  });

  // ---- 场景 7：work 抛错 ----
  it("场景7: work 抛错时原错误向上传递，记录保持 processing", async () => {
    const insertChain = makeInsertChain();

    mockDb.insert.mockReturnValue(insertChain);

    const theError = new Error("Business logic failed");
    const workFn = vi.fn().mockRejectedValue(theError);

    await expect(runIdempotent(makeInput(), workFn)).rejects.toThrow("Business logic failed");
    expect(workFn).toHaveBeenCalledTimes(1);
    expect(insertChain.values).toHaveBeenCalledTimes(1);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("场景7b: work 的 duplicate-key 错误原样透传，不进入幂等冲突分支", async () => {
    const insertChain = makeInsertChain();
    const selectChain = makeSelectChain([makeProcessingRecord()]);
    const duplicateBusinessError = makeDupError();
    const workFn = vi.fn().mockRejectedValue(duplicateBusinessError);

    mockDb.insert.mockReturnValue(insertChain);
    mockDb.select.mockReturnValue(selectChain);

    await expect(runIdempotent(makeInput(), workFn)).rejects.toBe(duplicateBusinessError);
    expect(workFn).toHaveBeenCalledTimes(1);
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  // ---- 场景 8：response_body 正确反序列化 ----
  it("场景8: completed 的 response_body 正确反序列化并保持泛型返回结构", async () => {
    const complexResponse = {
      orderId: "order-abc-123",
      items: [
        { productId: "prod-1", quantity: 2, price: 19.99 },
        { productId: "prod-2", quantity: 1, price: 29.99 },
      ],
      total: 69.97,
      appliedCoupon: { code: "SAVE10", discount: 10.0 },
      paymentStatus: "paid" as const,
      createdAt: "2026-07-13T12:00:00Z",
    };

    const insertChain = makeInsertChain(undefined, makeDupError());
    const selectChain = makeSelectChain([
      makeCompletedRecord({ response_body: complexResponse }),
    ]);

    mockDb.insert.mockReturnValue(insertChain);
    mockDb.select.mockReturnValue(selectChain);

    const result = await runIdempotent<typeof complexResponse>(makeInput(), vi.fn());

    expect(result).toEqual(complexResponse);
    expect(result.orderId).toBe("order-abc-123");
    expect(result.items).toHaveLength(2);
  });

  // ---- 场景 9：storeId 为 null 时匹配 ----
  it("场景9: storeId null 匹配 null store_id", async () => {
    const insertChain = makeInsertChain(undefined, makeDupError());
    const selectChain = makeSelectChain([makeCompletedRecord({ store_id: null })]);

    mockDb.insert.mockReturnValue(insertChain);
    mockDb.select.mockReturnValue(selectChain);

    const result = await runIdempotent(makeInput({ storeId: null }), vi.fn());
    expect(result).toEqual({ orderId: "order-999", total: 49.99 });
  });
});
