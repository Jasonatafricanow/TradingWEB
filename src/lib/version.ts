import fs from "node:fs";
import path from "node:path";

/**
 * 版本信息（版本更新模块核心）。
 *
 * 数据来源优先级：
 * 1. `.next/build-info.json` — 由 `scripts/write-build-info.mjs` 在构建后写入
 *    （buildId / gitCommit / gitBranch / builtAt）。
 * 2. `.next/BUILD_ID` — Next.js 构建产物自带的构建标识（兜底）。
 * 3. `package.json` 的 version — 应用语义版本。
 *
 * 热部署（release 目录 + current 软链切换）后，新进程会读到新构建的元数据，
 * `/api/version` 随之变化，客户端据此提示用户刷新。
 */
export interface VersionInfo {
  appVersion: string;
  buildId: string | null;
  gitCommit: string | null;
  gitBranch: string | null;
  builtAt: string | null;
  nodeEnv: string;
  startedAt: string;
}

export interface BuildInfoFile {
  buildId?: unknown;
  gitCommit?: unknown;
  gitBranch?: unknown;
  builtAt?: unknown;
}

/** 进程启动时间（模块首次加载即固定）。 */
const STARTED_AT = new Date().toISOString();

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** 纯函数：合并各来源的版本元数据，便于单元测试。 */
export function resolveVersionInfo(options: {
  packageVersion?: string;
  buildInfo?: BuildInfoFile | null;
  nextBuildId?: string | null;
  nodeEnv?: string;
  startedAt?: string;
}): VersionInfo {
  const info = options.buildInfo ?? null;
  return {
    appVersion: options.packageVersion ?? "0.0.0",
    buildId: asStringOrNull(info?.buildId) ?? asStringOrNull(options.nextBuildId),
    gitCommit: asStringOrNull(info?.gitCommit),
    gitBranch: asStringOrNull(info?.gitBranch),
    builtAt: asStringOrNull(info?.builtAt),
    nodeEnv: options.nodeEnv ?? "development",
    startedAt: options.startedAt ?? STARTED_AT,
  };
}

/** 服务端读取当前运行构建的版本信息（每次调用实时读盘，热部署后立即生效）。 */
export function getVersionInfo(): VersionInfo {
  const cwd = process.cwd();

  let packageVersion = "0.0.0";
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(cwd, "package.json"), "utf8"),
    ) as { version?: unknown };
    packageVersion = asStringOrNull(pkg.version) ?? "0.0.0";
  } catch {
    // package.json 不可读时保留默认值
  }

  let buildInfo: BuildInfoFile | null = null;
  try {
    buildInfo = JSON.parse(
      fs.readFileSync(path.join(cwd, ".next", "build-info.json"), "utf8"),
    ) as BuildInfoFile;
  } catch {
    // 未生成构建元数据（旧构建产物）：回退 BUILD_ID
  }

  let nextBuildId: string | null = null;
  try {
    nextBuildId =
      fs.readFileSync(path.join(cwd, ".next", "BUILD_ID"), "utf8").trim() || null;
  } catch {
    // 开发模式无构建产物
  }

  return resolveVersionInfo({
    packageVersion,
    buildInfo,
    nextBuildId,
    nodeEnv: process.env.NODE_ENV,
  });
}