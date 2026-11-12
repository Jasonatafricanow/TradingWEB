#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
for (const [entry, args] of [
  [require.resolve("next/dist/bin/next"), ["build"]],
  [require.resolve("tsup/dist/cli-default.js"), ["src/server.ts", "--format", "cjs", "--platform", "node", "--target", "node20", "--outDir", "dist", "--no-splitting", "--no-minify"]],
  ["scripts/write-build-info.mjs", []],
]) {
  const result = spawnSync(process.execPath, [entry, ...args], { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
