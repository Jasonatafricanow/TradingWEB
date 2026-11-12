"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/contexts/i18n-context";
import {
  VERSION_POLL_INTERVAL_MS,
  isDismissCoolingDown,
  isNewBuildAvailable,
  markDismissed,
} from "@/lib/version-check";

/**
 * 版本更新提示（版本更新模块）。
 *
 * 挂载于全局 ClientProviders：定时轮询 /api/version，发现新构建
 * （热部署切换 release 后 buildId 变化）时弹出非阻断 toast，
 * 用户自选「立即刷新」或「稍后」。不自动刷新，避免打断下单/收银操作。
 */
export function VersionUpdateNotifier() {
  const { t } = useI18n();
  const [currentBuildId, setCurrentBuildId] = useState<string | null>(null);
  const toastShownRef = useRef(false);

  // 首次挂载：记录当前页面所属构建
  useEffect(() => {
    let cancelled = false;
    fetch("/api/version", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setCurrentBuildId(json?.data?.buildId ?? null);
      })
      .catch(() => {
        // 首次探测失败不影响页面；后续轮询会继续尝试
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const notify = useCallback(
    (remoteBuildId: string) => {
      if (toastShownRef.current) return;
      if (isDismissCoolingDown(window.localStorage, remoteBuildId, Date.now())) {
        return;
      }
      toastShownRef.current = true;
      toast(t("version.update_available"), {
        description: t("version.update_description"),
        duration: Infinity,
        action: {
          label: t("version.refresh_now"),
          onClick: () => window.location.reload(),
        },
        cancel: {
          label: t("version.later"),
          onClick: () => {
            markDismissed(window.localStorage, remoteBuildId, Date.now());
            toastShownRef.current = false;
          },
        },
        onDismiss: () => {
          markDismissed(window.localStorage, remoteBuildId, Date.now());
          toastShownRef.current = false;
        },
      });
    },
    [t],
  );

  const checkForUpdate = useCallback(async () => {
    if (!currentBuildId || toastShownRef.current) return;
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { data?: { buildId?: string | null } };
      const remoteBuildId = json?.data?.buildId ?? null;
      if (remoteBuildId && isNewBuildAvailable(currentBuildId, json?.data)) {
        notify(remoteBuildId);
      }
    } catch {
      // 网络抖动/部署切换瞬间：静默，下一轮再试
    }
  }, [currentBuildId, notify]);

  // 定时轮询 + 页面重新可见时立即检查
  useEffect(() => {
    if (!currentBuildId) return;
    const timer = window.setInterval(() => {
      void checkForUpdate();
    }, VERSION_POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [currentBuildId, checkForUpdate]);

  return null;
}