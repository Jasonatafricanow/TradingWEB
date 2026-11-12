/**
 * 版本更新检测的纯逻辑（版本更新模块，客户端/服务端通用，便于单测）。
 */

export interface VersionProbe {
  buildId?: string | null;
}

/**
 * 判断远端探针是否代表一个「不同的新构建」。
 *
 * 规则（保守，避免误报）：
 * - 任一侧缺少 buildId（开发模式 / 旧构建产物）→ 不提示；
 * - buildId 相同 → 不提示；
 * - 两者都有且不同 → 提示刷新。
 */
export function isNewBuildAvailable(
  currentBuildId: string | null | undefined,
  remote: VersionProbe | null | undefined,
): boolean {
  if (!currentBuildId || !remote?.buildId) return false;
  return remote.buildId !== currentBuildId;
}

/** 轮询间隔：60 秒。版本探针极轻量，但无需更频繁。 */
export const VERSION_POLL_INTERVAL_MS = 60_000;

/** 同一构建的「稍后提醒」冷却时间：30 分钟内不重复弹提示。 */
export const VERSION_DISMISS_COOLDOWN_MS = 30 * 60_000;

const DISMISS_KEY_PREFIX = "tw-version-dismissed:";

export function dismissedStorageKey(buildId: string): string {
  return `${DISMISS_KEY_PREFIX}${buildId}`;
}

/**
 * 判断某构建的更新提示是否处于冷却期（用户点过「稍后」）。
 * storage 不可用（隐私模式等）时视为未冷却。
 */
export function isDismissCoolingDown(
  storage: Pick<Storage, "getItem">,
  buildId: string,
  now: number,
): boolean {
  try {
    const raw = storage.getItem(dismissedStorageKey(buildId));
    if (!raw) return false;
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt)) return false;
    return now - dismissedAt < VERSION_DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function markDismissed(
  storage: Pick<Storage, "setItem">,
  buildId: string,
  now: number,
): void {
  try {
    storage.setItem(dismissedStorageKey(buildId), String(now));
  } catch {
    // 存储不可用时静默忽略：最坏情况是提示更频繁
  }
}