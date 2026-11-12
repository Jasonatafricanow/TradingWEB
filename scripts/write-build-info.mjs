#!/usr/bin/env node
/**
 * 构建后生成 `.next/build-info.json`（版本更新模块）。
 *
 * 记录 buildId / git 提交 / 分支 / 构建时间，供：
 * - `/api/version` 与后台「版本与更新」页展示
 * - 热部署脚本 release.sh 命名 release 目录
 *
 * 用法：pnpm build 会自动追加执行；也可单独 `pnpm version:info`。
 * 在 `next build` 之后运行（需要 .next/BUILD_ID 已存在）。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const nextDir = path.join(root, ".next");

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

const buildIdPath = path.join(nextDir, "BUILD_ID");
const buildId = fs.existsSync(buildIdPath)
  ? fs.readFileSync(buildIdPath, "utf8").trim()
  : null;

const info = {
  buildId,
  gitCommit: git(["rev-parse", "HEAD"]),
  gitBranch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
  builtAt: new Date().toISOString(),
};

fs.mkdirSync(nextDir, { recursive: true });
fs.writeFileSync(
  path.join(nextDir, "build-info.json"),
  JSON.stringify(info, null, 2) + "\n",
);

console.log(
  `[build-info] buildId=${info.buildId ?? "unknown"} commit=${info.gitCommit ?? "unknown"} builtAt=${info.builtAt}`,
);