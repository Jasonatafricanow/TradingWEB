#!/usr/bin/env bash
# =============================================================================
# TradingWEB 热部署 · 本地端（版本更新模块）
#
# 在开发机执行：本地构建 → 生成构建元数据 → 打包产物 → 上传服务器 →
# 调用服务器 scripts/release.sh 完成不停机切换。
#
# 用法：
#   bash scripts/deploy-release.sh user@server [--app-root /opt/tradingweb] [--skip-build]
#
# 依赖：本地 pnpm / rsync / ssh；服务器已按 DEPLOYMENT.md 完成 release 目录初始化。
# 注意：服务器内存小，严禁在服务器上 next build —— 构建永远在本地/CI 完成。
# =============================================================================
set -Eeuo pipefail

REMOTE=""
APP_ROOT="/opt/tradingweb"
SKIP_BUILD=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-root) APP_ROOT="$2"; shift 2 ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    -h|--help) grep '^#' "$0" | head -20; exit 0 ;;
    *) REMOTE="$1"; shift ;;
  esac
done

[[ -n "$REMOTE" ]] || { echo "用法: bash scripts/deploy-release.sh user@server [--app-root DIR] [--skip-build]" >&2; exit 1; }
command -v rsync >/dev/null || { echo "本地缺少 rsync" >&2; exit 1; }
command -v ssh >/dev/null || { echo "本地缺少 ssh" >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$SKIP_BUILD" != "1" ]]; then
  echo "[deploy] 本地构建（含构建元数据）..."
  pnpm build
fi

[[ -f .next/BUILD_ID ]] || { echo "缺少 .next/BUILD_ID，请先构建" >&2; exit 1; }
BUILD_ID="$(tr -d '[:space:]' < .next/BUILD_ID)"
RELEASE_ID="${BUILD_ID:-$(date +%Y%m%d%H%M%S)}"
echo "[deploy] release-id=$RELEASE_ID"

STAGING="$(mktemp -d)"
trap 'rm -rf -- "$STAGING"' EXIT
PKG="$STAGING/$RELEASE_ID"
mkdir -p "$PKG"

echo "[deploy] 组装产物..."
# 源码与配置（服务器不构建，但需要源码供 next start 与后续排查）
rsync -a \
  --exclude 'node_modules' --exclude '.next' --exclude '.git' \
  --exclude '.open-next' --exclude 'dist' --exclude '.pnpm-store' \
  --exclude 'test-results' --exclude '.pytest_cache' --exclude '.env.local' \
  ./ "$PKG/"
# 构建产物（排除缓存与诊断，保留 standalone 之外的运行所需文件）
rsync -a \
  --exclude 'cache' --exclude 'diagnostics' --exclude 'types' \
  --exclude 'turbopack' --exclude 'lock' \
  ./.next/ "$PKG/.next/"

echo "[deploy] 上传到 $REMOTE:$APP_ROOT/releases/$RELEASE_ID ..."
ssh "$REMOTE" "mkdir -p '$APP_ROOT/releases' '$APP_ROOT/shared' '$APP_ROOT/logs'"
rsync -az --delete "$PKG/" "$REMOTE:$APP_ROOT/releases/$RELEASE_ID/"

echo "[deploy] 触发服务器热部署..."
ssh "$REMOTE" "bash '$APP_ROOT/releases/$RELEASE_ID/scripts/release.sh' '$RELEASE_ID'"

echo "[deploy] 完成：$RELEASE_ID"