/**
 * 数据库连接健康检查
 *
 * 用法：
 *   1. 代码中调用：import { testDbConnection } from '@/lib/db-test'
 *   2. 独立脚本运行：pnpm test-db
 */
import { getDb } from '@/lib/db';

export interface DbStatus {
  ok: boolean;
  latency: number;
  error?: string;
  dbName?: string;
}

export async function testDbConnection(): Promise<DbStatus> {
  const start = Date.now();
  try {
    const db = getDb();
    await db.$client.execute('SELECT 1');
    const latency = Date.now() - start;
    let dbName: string | undefined;
    try {
      const [rows] = await db.$client.execute('SELECT DATABASE() as dbName');
      if (Array.isArray(rows) && rows.length > 0) {
        dbName = (rows[0] as Record<string, unknown>).dbName as string | undefined;
      }
    } catch {
      // 获取库名失败不阻断
    }
    return { ok: true, latency, dbName };
  } catch (error: unknown) {
    const latency = Date.now() - start;
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, latency, error: message };
  }
}

// 独立脚本运行时输出 JSON 并退出
const isDirectRun = process.argv[1]?.endsWith('db-test.ts') ||
                     process.argv[1]?.endsWith('db-test.js');
if (isDirectRun) {
  testDbConnection()
    .then((status) => {
      console.log(JSON.stringify(status));
      process.exit(status.ok ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
