import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from '@/storage/database/shared/schema';
import type { MySql2Database } from 'drizzle-orm/mysql2';

/** Drizzle ORM 类型 + 底层 mysql2 连接池（$client） */
type DbWithClient = MySql2Database<typeof schema> & {
  $client: mysql.Pool;
};

let dbInstance: DbWithClient | null = null;
let poolInstance: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (!poolInstance) {
    const host = process.env.DB_HOST?.trim();
    if (!host) {
      throw new Error(
        'Database not configured — set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in .env.local'
      );
    }
    poolInstance = mysql.createPool({
      host,
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return poolInstance;
}

export function getDb(): DbWithClient {
  if (!dbInstance) {
    dbInstance = drizzle(getPool(), { schema, mode: 'planetscale' }) as DbWithClient;
    // 注入 $client 引用，供需要原生 SQL 的模块使用
    (dbInstance as unknown as Record<string, unknown>).$client = poolInstance!;
  }
  return dbInstance;
}

/**
 * 统一数据库访问入口（惰性初始化）
 *
 * 模块 import 时不会连接数据库——首次 .select() / .insert() / .$client.execute()
 * 调用时才触发连接。SQL 写入服务统一通过此 Proxy 转发到惰性初始化的实例。
 */
export const db = new Proxy({} as DbWithClient, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
}) as unknown as DbWithClient;
