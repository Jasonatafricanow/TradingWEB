#!/usr/bin/env bash
# =============================================================================
# TradingWEB 不停机热部署（版本更新模块 · 服务器端）
#
# 前置（一次性准备，见 DEPLOYMENT.md「不停机热部署」章节）：
#   - /opt/tradingweb/releases/<release-id>/  存放每次上传的完整产物
#   - /opt/tradingweb/current -> releases/<id>  软链，PM2 的 cwd 指向它
#   - /opt/tradingweb/shared/.env               生产环境变量（各 release 软链共享）
#   - PM2 以 ecosystem.config.js 管理（cwd=/opt/tradingweb/current）
#
# 用法（在服务器上执行）：
#   bash scripts/release.sh <release-id> [--keep N]
#   release-id 建议用构建标识（.next/build-info.json 的 buildId）或 git 短提交。
#
# 流程：校验产物 → 软链 shared/.env → 从 current 继承 node_modules（硬链接，
#       秒级、省内存；依赖有变化时加 --install-deps）→ 健康检查新实例
#       → 原子切换 current 软链 → pm2 reload（优雅重启，旧进程处理完存量请求）
#       → 复检 → 失败自动回滚到上一 release。
#
# 说明：单实例 fork 模式下 pm2 reload 会优雅重启进程（秒级、不拒绝连接前提
#       是 nginx 有 proxy_next_upstream/重试或短暂排队）；全程不需要 pm2 stop，
#       不删除正在服务的产物。服务器内存紧张时禁止在服务器上 next build。
# =============================================================================
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/opt/tradingweb}"
APP_NAME="${APP_NAME:-tradingweb}"
APP_PORT="${APP_PORT:-3000}"
HEALTH_PATH="${HEALTH_PATH:-/api/version}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
INSTALL_DEPS=0

log()  { printf '[release] %s\n' "$*"; }
fail() { printf '[release] ERROR: %s\n' "$*" >&2; exit 1; }

RELEASE_ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep) KEEP_RELEASES="$2"; shift 2 ;;
    --install-deps) INSTALL_DEPS=1; shift ;;
    -h|--help) grep '^#' "$0" | head -30; exit 0 ;;
    *) RELEASE_ID="$1"; shift ;;
  esac
done

[[ -n "$RELEASE_ID" ]] || fail "缺少 release-id。用法: bash scripts/release.sh <release-id> [--keep N] [--install-deps]"
[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]] || fail "release-id 只允许字母/数字/._-"

RELEASES_DIR="$APP_ROOT/releases"
SHARED_DIR="$APP_ROOT/shared"
CURRENT_LINK="$APP_ROOT/current"
NEW_DIR="$RELEASES_DIR/$RELEASE_ID"

# ecosystem.config.js 读取该变量决定 PM2 的 cwd（指向 current 软链）
export TRADINGWEB_CWD="$CURRENT_LINK"

[[ -d "$NEW_DIR" ]] || fail "产物目录不存在: $NEW_DIR（请先上传源码与本地构建的 .next）"
[[ -f "$NEW_DIR/package.json" ]] || fail "产物缺少 package.json"
[[ -f "$NEW_DIR/.next/BUILD_ID" ]] || fail "产物缺少 .next/BUILD_ID（请在本地构建后上传 .next）"
[[ -f "$NEW_DIR/ecosystem.config.js" ]] || fail "产物缺少 ecosystem.config.js"
command -v pm2 >/dev/null || fail "未找到 pm2"
command -v node >/dev/null || fail "未找到 node"

# ── 记录当前 release（回滚锚点）────────────────────────────────────────────
PREV_DIR=""
if [[ -L "$CURRENT_LINK" ]]; then
  PREV_DIR="$(readlink -f "$CURRENT_LINK")"
  log "当前 release: $PREV_DIR"
fi
[[ "$PREV_DIR" != "$NEW_DIR" ]] || fail "目标 release 已是 current，无需切换"

# ── 共享 .env ──────────────────────────────────────────────────────────────
if [[ -f "$SHARED_DIR/.env" ]]; then
  ln -sfn "$SHARED_DIR/.env" "$NEW_DIR/.env"
  log "已链接 shared/.env"
else
  log "警告: $SHARED_DIR/.env 不存在，沿用产物自带环境变量"
fi

# ── 依赖：硬链接继承或全新安装 ─────────────────────────────────────────────
if [[ "$INSTALL_DEPS" == "1" ]]; then
  log "在 release 目录安装生产依赖（pnpm install --prod）..."
  (cd "$NEW_DIR" && pnpm install --prod --frozen-lockfile)
elif [[ -n "$PREV_DIR" && -d "$PREV_DIR/node_modules" ]]; then
  if cmp -s "$PREV_DIR/pnpm-lock.yaml" "$NEW_DIR/pnpm-lock.yaml"; then
    log "lockfile 未变化，硬链接继承 node_modules（不占额外磁盘）..."
    cp -al "$PREV_DIR/node_modules" "$NEW_DIR/node_modules"
  else
    fail "pnpm-lock.yaml 有变化，请加 --install-deps 重新安装依赖"
  fi
else
  fail "无可继承的 node_modules，请加 --install-deps 首次安装"
fi

# ── 健康检查函数 ───────────────────────────────────────────────────────────
wait_healthy() {
  local base_url="$1" deadline=$((SECONDS + HEALTH_TIMEOUT)) code
  while (( SECONDS < deadline )); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "$base_url$HEALTH_PATH" || true)"
    if [[ "$code" == "200" ]]; then
      log "健康检查通过: $base_url$HEALTH_PATH"
      return 0
    fi
    sleep 2
  done
  return 1
}

# ── 新实例预检（独立端口，不影响线上）─────────────────────────────────────
PREVIEW_PORT="${PREVIEW_PORT:-3100}"
PREVIEW_LOG="$APP_ROOT/logs/release-preview.log"
PREVIEW_PID_FILE="$APP_ROOT/logs/release-preview.pid"
mkdir -p "$APP_ROOT/logs"

# 清理上次异常退出残留的预检进程（仅限本脚本自己记录的 PID）
if [[ -f "$PREVIEW_PID_FILE" ]]; then
  STALE_PID="$(cat "$PREVIEW_PID_FILE" 2>/dev/null || true)"
  if [[ -n "$STALE_PID" ]] && kill -0 "$STALE_PID" 2>/dev/null; then
    log "清理残留预检进程 PID=$STALE_PID"
    kill "$STALE_PID" 2>/dev/null || true
    sleep 1
  fi
fi

log "在端口 $PREVIEW_PORT 预启动新构建做健康检查..."
# exec 使子 shell 直接成为 node 进程，$! 即真实 PID，便于精确清理
(
  cd "$NEW_DIR"
  NODE_ENV=production PORT="$PREVIEW_PORT" exec node node_modules/next/dist/bin/next start -p "$PREVIEW_PORT"
) >"$PREVIEW_LOG" 2>&1 &
PREVIEW_PID=$!
echo "$PREVIEW_PID" > "$PREVIEW_PID_FILE"
cleanup_preview() {
  if [[ -n "${PREVIEW_PID:-}" ]] && kill -0 "$PREVIEW_PID" 2>/dev/null; then
    kill "$PREVIEW_PID" 2>/dev/null || true
  fi
}
trap cleanup_preview EXIT

if ! wait_healthy "http://127.0.0.1:$PREVIEW_PORT"; then
  fail "新构建健康检查失败（日志: $PREVIEW_LOG），未切换线上"
fi
NEW_BUILD_ID="$(curl -s "http://127.0.0.1:$PREVIEW_PORT$HEALTH_PATH" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).data.buildId||"")}catch{console.log("")}})')"
cleanup_preview
trap - EXIT
log "新构建预检通过 buildId=${NEW_BUILD_ID:-unknown}"

# ── 原子切换 + 优雅重载 ────────────────────────────────────────────────────
ln -sfn "$NEW_DIR" "$APP_ROOT/.current-next"
mv -Tf "$APP_ROOT/.current-next" "$CURRENT_LINK"
log "current 已切换到 $NEW_DIR"

(cd "$APP_ROOT" && pm2 startOrReload "$CURRENT_LINK/ecosystem.config.js" --update-env)
pm2 save >/dev/null 2>&1 || true

if wait_healthy "http://127.0.0.1:$APP_PORT"; then
  log "热部署完成：$RELEASE_ID（buildId=${NEW_BUILD_ID:-unknown}）"
else
  log "切换后健康检查失败，开始回滚..."
  if [[ -n "$PREV_DIR" ]]; then
    ln -sfn "$PREV_DIR" "$APP_ROOT/.current-next"
    mv -Tf "$APP_ROOT/.current-next" "$CURRENT_LINK"
    (cd "$APP_ROOT" && pm2 startOrReload "$CURRENT_LINK/ecosystem.config.js" --update-env)
    wait_healthy "http://127.0.0.1:$APP_PORT" || fail "回滚后仍不健康，请人工介入: pm2 logs $APP_NAME"
    fail "已回滚到 $PREV_DIR（新 release 保留在 $NEW_DIR 供排查）"
  fi
  fail "无历史 release 可回滚，请人工介入: pm2 logs $APP_NAME"
fi

# ── 保留最近 N 个 release（不删除当前与上一个）────────────────────────────
if [[ "$KEEP_RELEASES" =~ ^[0-9]+$ ]] && (( KEEP_RELEASES > 0 )); then
  mapfile -t OLD_RELEASES < <(ls -1t "$RELEASES_DIR" | tail -n +$((KEEP_RELEASES + 1)))
  for old in "${OLD_RELEASES[@]:-}"; do
    [[ -n "$old" ]] || continue
    old_dir="$RELEASES_DIR/$old"
    [[ "$old_dir" != "$NEW_DIR" && "$old_dir" != "$PREV_DIR" ]] || continue
    log "清理旧 release: $old_dir"
    rm -rf -- "$old_dir"
  done
fi

log "done."