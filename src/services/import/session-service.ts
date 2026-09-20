/**
 * 导入 session 生命周期管理
 *
 * - createImportSession：创建一次 import 会话（POST /api/admin/import/sessions）
 * - listImportSessions：列出 session（分页 + 过滤）
 * - getImportSessionDetail：单 session 详情，含 jobs + mirror_progress
 *
 * 设计要点：
 * - import_jobs 行不在 session 创建时预插入，而是 receiver POST /products|customers|orders 时才创建
 * - mirror_progress 通过查 external_source_mappings + product_images 聚合算出（决策 1）
 * - source_store 是字符串命名空间，不和 stores.id 关联（决策 2）
 * - 没有回滚端点（决策 3）
 */
import { db } from "@/lib/db";
import {
  importSessions,
  importJobs,
  externalSourceMappings,
  productImages,
} from "@/storage/database/shared/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { ValidationError } from "@/lib/errors";
import type { AuthenticatedUser } from "@/services/auth/auth-middleware";
import type {
  CreateImportSessionRequest,
  CreateImportSessionResponse,
  ImportSessionDetail,
  ImportSessionStatus,
  ImportJobSummary,
  MirrorProgress,
  ImportJobReconciliation,
  ImportReconciliationSummary,
  ImportSource,
  CustomerLinkStrategy,
  ImportJobType,
  ImportJobStatus,
  ImportRecordError,
} from "@/types/import-contract";

const ALLOWED_STRATEGIES: CustomerLinkStrategy[] = [
  "auto_create_user",
  "guest_placeholder",
  "skip_unmatched",
];

const ALLOWED_JOB_TYPES: ReadonlySet<ImportJobType> = new Set<ImportJobType>([
  "products",
  "customers",
  "orders",
  "discounts",
  "redirects",
  "validate",
]);

type ImportSessionRow = typeof importSessions.$inferSelect;
type ImportJobRow = typeof importJobs.$inferSelect;

interface CountRow {
  source_type?: string | null;
  local_table?: string | null;
  cnt?: number | string | null;
}

interface OrderTotalsRow {
  order_count?: number | string | null;
  total_amount?: number | string | null;
  paid_amount?: number | string | null;
  currency?: string | null;
  currency_count?: number | string | null;
}

function parseExpectedJobs(value: unknown): ImportJobType[] {
  if (!Array.isArray(value)) return [];
  return value.filter((job): job is ImportJobType => ALLOWED_JOB_TYPES.has(job as ImportJobType));
}

function normalizeErrors(value: unknown): ImportRecordError[] {
  return Array.isArray(value) ? (value as ImportRecordError[]) : [];
}

function buildJobReconciliation(
  expectedJobs: ImportJobType[],
  jobs: ImportJobRow[],
): ImportJobReconciliation[] {
  const latestByType = new Map<ImportJobType, ImportJobRow>();
  for (const job of jobs) {
    const jobType = job.job_type as ImportJobType;
    const current = latestByType.get(jobType);
    if (!current || job.started_at.getTime() > current.started_at.getTime()) {
      latestByType.set(jobType, job);
    }
  }

  const jobTypes = new Set<ImportJobType>([
    ...expectedJobs,
    ...jobs.map((job) => job.job_type as ImportJobType),
  ]);

  return [...jobTypes].map((jobType) => {
    const latest = latestByType.get(jobType);
    const totalRows = latest?.total_rows ?? 0;
    const successRows = latest?.success_rows ?? 0;
    const status: ImportJobStatus | "missing" = latest ? (latest.status as ImportJobStatus) : "missing";
    return {
      job_type: jobType,
      expected: expectedJobs.includes(jobType),
      present: Boolean(latest),
      status,
      total_rows: totalRows,
      success_rows: successRows,
      failed_rows: latest?.failed_rows ?? 0,
      success_rate: totalRows > 0 ? Math.round((successRows / totalRows) * 1000) / 10 : 0,
    };
  });
}

async function buildReconciliationSummary(
  session: ImportSessionRow,
  jobs: ImportJobRow[],
  mirror: MirrorProgress | undefined,
): Promise<ImportReconciliationSummary> {
  const expectedJobs = parseExpectedJobs(session.expected_jobs).filter((job) => job !== "validate");
  const jobReconciliation = buildJobReconciliation(expectedJobs, jobs);
  const missingJobs = expectedJobs.filter((job) => !jobs.some((row) => row.job_type === job));

  const [mappingRows] = await db.$client.execute(
    `SELECT source_type, local_table, COUNT(*) AS cnt
     FROM external_source_mappings
     WHERE source = ? AND source_store = ?
     GROUP BY source_type, local_table
     ORDER BY source_type ASC, local_table ASC`,
    [session.source, session.source_store],
  );

  const [orderRows] = await db.$client.execute(
    `SELECT
       COUNT(*) AS order_count,
       COALESCE(SUM(CAST(o.total_amount AS DECIMAL(18, 2))), 0) AS total_amount,
       COALESCE(SUM(
         CASE
           WHEN o.payment_status = 'paid'
             OR o.financial_status IN ('paid', 'partially_refunded')
             OR o.status IN ('paid', 'processing', 'completed')
           THEN CAST(o.total_amount AS DECIMAL(18, 2))
           ELSE 0
         END
       ), 0) AS paid_amount,
       MIN(o.currency) AS currency,
       COUNT(DISTINCT o.currency) AS currency_count
     FROM external_source_mappings m
     INNER JOIN orders o ON m.local_table = 'orders' AND m.local_id = o.id
     WHERE m.source = ? AND m.source_store = ? AND m.source_type = 'order'`,
    [session.source, session.source_store],
  );

  const errorCounts = new Map<string, number>();
  let totalErrors = 0;
  for (const job of jobs) {
    for (const error of normalizeErrors(job.errors)) {
      totalErrors++;
      errorCounts.set(error.code, (errorCounts.get(error.code) ?? 0) + 1);
    }
  }

  const orderTotal = (orderRows as OrderTotalsRow[])[0] ?? {};
  const failedMirror = mirror?.failed ?? 0;
  const hasIncompleteExpectedJob = jobReconciliation.some(
    (job) => job.expected && job.status !== "completed",
  );

  return {
    expected_jobs: expectedJobs,
    missing_jobs: missingJobs,
    jobs: jobReconciliation,
    mappings: (mappingRows as CountRow[]).map((row) => ({
      source_type: String(row.source_type ?? ""),
      local_table: String(row.local_table ?? ""),
      count: Number(row.cnt ?? 0),
    })),
    order_totals: {
      count: Number(orderTotal.order_count ?? 0),
      total_amount: Number(orderTotal.total_amount ?? 0),
      paid_amount: Number(orderTotal.paid_amount ?? 0),
      currency: orderTotal.currency ?? null,
      currency_count: Number(orderTotal.currency_count ?? 0),
    },
    errors_by_code: [...errorCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count),
    total_errors: totalErrors,
    completed: !hasIncompleteExpectedJob && missingJobs.length === 0 && totalErrors === 0 && failedMirror === 0,
  };
}

export async function createImportSession(
  user: AuthenticatedUser,
  input: CreateImportSessionRequest,
): Promise<CreateImportSessionResponse> {
  if (!input?.source || !input.source_store) {
    throw new ValidationError("source 和 source_store 不能为空");
  }
  if (!Array.isArray(input.expected_jobs) || input.expected_jobs.length === 0) {
    throw new ValidationError("expected_jobs 至少要列 1 项 job 类型");
  }
  for (const j of input.expected_jobs) {
    if (!ALLOWED_JOB_TYPES.has(j)) {
      throw new ValidationError(`不支持的 job 类型：${j}`);
    }
  }
  const strategy: CustomerLinkStrategy =
    input.customer_link_strategy ?? "auto_create_user";
  if (!ALLOWED_STRATEGIES.includes(strategy)) {
    throw new ValidationError(`不支持的 customer_link_strategy：${strategy}`);
  }

  const id = randomUUID();
  const started_at = new Date();

  await db.insert(importSessions).values({
    id,
    source: input.source,
    source_store: input.source_store,
    status: "open",
    expected_jobs: input.expected_jobs as never,
    customer_link_strategy: strategy,
    started_by: user.staffId ?? user.id,
    started_at,
  });

  return { session_id: id, created_at: started_at.toISOString() };
}

export interface ListImportSessionsFilters {
  source?: ImportSource;
  source_store?: string;
  status?: ImportSessionStatus;
  page?: number;
  pageSize?: number;
}

export interface ListImportSessionsResult {
  data: ImportSessionDetail[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listImportSessions(
  filters: ListImportSessionsFilters = {},
): Promise<ListImportSessionsResult> {
  const page =
    Number.isFinite(filters.page) && filters.page && filters.page > 0
      ? Math.floor(filters.page)
      : 1;
  const pageSize =
    Number.isFinite(filters.pageSize) && filters.pageSize && filters.pageSize > 0
      ? Math.min(100, Math.floor(filters.pageSize))
      : 20;
  const offset = (page - 1) * pageSize;

  const conds = [];
  if (filters.source) conds.push(eq(importSessions.source, filters.source));
  if (filters.source_store)
    conds.push(eq(importSessions.source_store, filters.source_store));
  if (filters.status) conds.push(eq(importSessions.status, filters.status));
  const whereExpr = conds.length > 0 ? and(...conds) : sql`1=1`;

  const totalRow = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(importSessions)
    .where(whereExpr);
  const total = Number(totalRow[0]?.count) || 0;

  const rows = await db
    .select()
    .from(importSessions)
    .where(whereExpr)
    .orderBy(desc(importSessions.started_at))
    .limit(pageSize)
    .offset(offset);

  // 批量带上 jobs（轻量；列表场景 errors 不返回，详情页才返回）
  const sessionIds = rows.map((r) => r.id);
  const jobsMap = new Map<string, ImportJobSummary[]>();
  if (sessionIds.length > 0) {
    const allJobs = await db
      .select()
      .from(importJobs)
      .where(inArray(importJobs.session_id, sessionIds));
    for (const j of allJobs) {
      const arr = jobsMap.get(j.session_id) ?? [];
      arr.push({
        id: j.id,
        job_type: j.job_type as ImportJobType,
        status: j.status as ImportJobSummary["status"],
        total_rows: j.total_rows,
        success_rows: j.success_rows,
        failed_rows: j.failed_rows,
      });
      jobsMap.set(j.session_id, arr);
    }
  }

  return {
    data: rows.map((r) => ({
      session_id: r.id,
      source: r.source as ImportSource,
      source_store: r.source_store,
      status: r.status as ImportSessionStatus,
      customer_link_strategy: r.customer_link_strategy as CustomerLinkStrategy,
      jobs: jobsMap.get(r.id) ?? [],
      started_at: r.started_at.toISOString(),
      finished_at: r.finished_at?.toISOString() ?? null,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getImportSessionDetail(
  id: string,
): Promise<ImportSessionDetail> {
  const sessions = await db
    .select()
    .from(importSessions)
    .where(eq(importSessions.id, id))
    .limit(1);
  const session = sessions[0];
  if (!session) {
    // TODO: 真 404 语义需要 NotFoundError + errorResponse 扩展；P2a 暂用 ValidationError → 400
    throw new ValidationError(`import session not found: ${id}`);
  }

  const jobs = await db
    .select()
    .from(importJobs)
    .where(eq(importJobs.session_id, id));

  const jobSummaries: ImportJobSummary[] = jobs.map((j) => ({
    id: j.id,
    job_type: j.job_type as ImportJobType,
    status: j.status as ImportJobSummary["status"],
    total_rows: j.total_rows,
    success_rows: j.success_rows,
    failed_rows: j.failed_rows,
    errors: normalizeErrors(j.errors),
  }));

  // TODO: 当前 mirror_progress 按 source_store 聚合（包含本 session_store 历史所有图）
  //       而不是只属于本 session。要精确到 session，需要在 receiver 写 mapping 时额外打 session_id 标签。
  //       P2a 先按 source_store 报告，规模上去再细化。
  const imageMappings = await db
    .select({ local_id: externalSourceMappings.local_id })
    .from(externalSourceMappings)
    .where(
      and(
        eq(externalSourceMappings.source, session.source),
        eq(externalSourceMappings.source_store, session.source_store),
        eq(externalSourceMappings.source_type, "image"),
      ),
    );

  let mirror: MirrorProgress | undefined;
  if (imageMappings.length > 0) {
    const localIds = imageMappings.map((m) => m.local_id);
    const counts = await db
      .select({
        mirror_status: productImages.mirror_status,
        cnt: sql<number>`COUNT(*)`,
      })
      .from(productImages)
      .where(inArray(productImages.id, localIds))
      .groupBy(productImages.mirror_status);

    let total = 0,
      pending = 0,
      mirrored = 0,
      failed = 0;
    for (const c of counts) {
      const n = Number(c.cnt) || 0;
      total += n;
      if (c.mirror_status === "mirrored") mirrored += n;
      else if (c.mirror_status === "failed") failed += n;
      else pending += n;
    }
    mirror = { total, pending, mirrored, failed };
  }

  const reconciliation = await buildReconciliationSummary(session, jobs, mirror);

  return {
    session_id: session.id,
    source: session.source as ImportSource,
    source_store: session.source_store,
    status: session.status as ImportSessionStatus,
    customer_link_strategy: session.customer_link_strategy as CustomerLinkStrategy,
    jobs: jobSummaries,
    mirror_progress: mirror,
    reconciliation,
    started_at: session.started_at.toISOString(),
    finished_at: session.finished_at?.toISOString() ?? null,
  };
}

export async function refreshImportSessionStatus(sessionId: string): Promise<void> {
  const sessions = await db
    .select()
    .from(importSessions)
    .where(eq(importSessions.id, sessionId))
    .limit(1);
  const session = sessions[0];
  if (!session) return;

  const expectedJobs: ImportJobType[] = Array.isArray(session.expected_jobs)
    ? (session.expected_jobs as ImportJobType[]).filter((j) => j !== "validate")
    : [];
  if (expectedJobs.length === 0) return;

  const jobs = await db
    .select()
    .from(importJobs)
    .where(eq(importJobs.session_id, sessionId));

  if (jobs.length === 0) {
    await db
      .update(importSessions)
      .set({ status: "open", finished_at: null })
      .where(eq(importSessions.id, sessionId));
    return;
  }

  const latestByType = new Map<ImportJobType, typeof jobs[number]>();
  for (const job of jobs) {
    const jobType = job.job_type as ImportJobType;
    if (!expectedJobs.includes(jobType)) continue;
    const current = latestByType.get(jobType);
    if (!current || job.started_at.getTime() > current.started_at.getTime()) {
      latestByType.set(jobType, job);
    }
  }

  const hasRunningJob = jobs.some((j) => j.status === "running" || j.status === "pending");
  const hasAllExpectedJobs = expectedJobs.every((j) => latestByType.has(j));
  const latestStartedJobs = [...latestByType.values()];

  if (hasRunningJob) {
    await db
      .update(importSessions)
      .set({ status: "running", finished_at: null })
      .where(eq(importSessions.id, sessionId));
    return;
  }

  if (latestStartedJobs.some((j) => j.status === "failed")) {
    await db
      .update(importSessions)
      .set({ status: "failed", finished_at: new Date() })
      .where(eq(importSessions.id, sessionId));
    return;
  }

  if (!hasAllExpectedJobs) {
    await db
      .update(importSessions)
      .set({ status: "running", finished_at: null })
      .where(eq(importSessions.id, sessionId));
    return;
  }

  const latestExpectedJobs = expectedJobs.map((j) => latestByType.get(j)!);
  const allCompleted = latestExpectedJobs.every((j) => j.status === "completed");
  await db
    .update(importSessions)
    .set({
      status: allCompleted ? "completed" : "failed",
      finished_at: new Date(),
    })
    .where(eq(importSessions.id, sessionId));
}
