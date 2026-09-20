import { db } from "@/lib/db";
import { urlRedirects } from "@/storage/database/shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

type RedirectStatusCode = 301 | 302 | 307 | 308;
type DbLike = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface UrlRedirectInput {
  old_path: string;
  new_path: string;
  status_code?: number | null;
  source?: string | null;
  source_store?: string | null;
  source_id?: string | null;
  is_active?: boolean;
}

export interface RedirectListFilters {
  search?: string;
  source?: string;
  source_store?: string;
  page?: number;
  pageSize?: number;
}

function normalizePath(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) throw new Error("path is required");
  let path = trimmed;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      path = `${url.pathname}${url.search}`;
    }
  } catch {
    path = trimmed;
  }
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path;
}

function normalizeStatusCode(value: number | null | undefined): RedirectStatusCode {
  return [301, 302, 307, 308].includes(Number(value))
    ? (Number(value) as RedirectStatusCode)
    : 301;
}

function assertRedirect(input: UrlRedirectInput) {
  const oldPath = normalizePath(input.old_path);
  const newPath = normalizePath(input.new_path);
  if (oldPath === newPath) throw new Error("old_path and new_path cannot be the same");
  return {
    oldPath,
    newPath,
    statusCode: normalizeStatusCode(input.status_code),
  };
}

export async function upsertUrlRedirect(input: UrlRedirectInput, dbLike: DbLike = db) {
  const normalized = assertRedirect(input);
  const id = randomUUID();
  await dbLike
    .insert(urlRedirects)
    .values({
      id,
      old_path: normalized.oldPath,
      new_path: normalized.newPath,
      status_code: normalized.statusCode,
      source: input.source ?? null,
      source_store: input.source_store ?? null,
      source_id: input.source_id ?? null,
      is_active: input.is_active ?? true,
      updated_at: new Date(),
    })
    .onDuplicateKeyUpdate({
      set: {
        new_path: normalized.newPath,
        status_code: normalized.statusCode,
        source: input.source ?? null,
        source_store: input.source_store ?? null,
        source_id: input.source_id ?? null,
        is_active: input.is_active ?? true,
        updated_at: new Date(),
      },
    });

  const rows = await dbLike
    .select()
    .from(urlRedirects)
    .where(eq(urlRedirects.old_path, normalized.oldPath))
    .limit(1);
  return rows[0] ?? null;
}

export async function listUrlRedirects(filters: RedirectListFilters = {}) {
  const page = Number.isFinite(filters.page) && filters.page && filters.page > 0
    ? Math.floor(filters.page)
    : 1;
  const pageSize = Number.isFinite(filters.pageSize) && filters.pageSize && filters.pageSize > 0
    ? Math.min(100, Math.floor(filters.pageSize))
    : 20;
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const params: Array<string | number> = [];
  const search = filters.search?.trim();
  if (search) {
    where.push("(old_path LIKE ? OR new_path LIKE ? OR source_id LIKE ?)");
    const keyword = `%${search}%`;
    params.push(keyword, keyword, keyword);
  }
  if (filters.source && filters.source !== "all") {
    where.push("source = ?");
    params.push(filters.source);
  }
  if (filters.source_store) {
    where.push("source_store = ?");
    params.push(filters.source_store);
  }

  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const [countRows] = await db.$client.execute(
    `SELECT COUNT(*) AS total FROM url_redirects${whereSql}`,
    params,
  );
  const total = Number((countRows as Array<{ total?: number | string }>)[0]?.total ?? 0);

  const [rows] = await db.$client.execute(
    `SELECT * FROM url_redirects${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, String(pageSize), String(offset)],
  );
  return {
    data: rows as Array<typeof urlRedirects.$inferSelect>,
    total,
    page,
    pageSize,
  };
}

export async function deleteUrlRedirect(id: string) {
  await db.delete(urlRedirects).where(eq(urlRedirects.id, id));
  return { success: true };
}

export async function resolveUrlRedirect(path: string) {
  const oldPath = normalizePath(path);
  const [rows] = await db.$client.execute(
    "SELECT * FROM url_redirects WHERE old_path = ? AND is_active = true LIMIT 1",
    [oldPath],
  );
  const row = (rows as Array<typeof urlRedirects.$inferSelect>)[0];
  if (!row) return null;

  await db.$client.execute(
    "UPDATE url_redirects SET hits = hits + 1, last_hit_at = NOW(), updated_at = NOW() WHERE id = ?",
    [row.id],
  );

  return {
    ...row,
    status_code: normalizeStatusCode(row.status_code),
  };
}
