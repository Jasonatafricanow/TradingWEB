"use client";

import { useEffect, useState } from "react";
import { Heart } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useI18n } from "@/contexts/i18n-context";
import { useAuth } from "@/contexts/auth-context";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/utils";

const KEY = "tradingweb_wishlist";

function readLocal(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(ids: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* 忽略 */ }
}

/**
 * 心愿单按钮：乐观更新本地状态并给出即时反馈，
 * 已登录时同步到后端；失败仅提示，不回滚本地收藏意图。
 */
export function WishlistButton({
  productId,
  className,
  size = "md",
}: {
  productId: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSaved(readLocal().includes(productId));
  }, [productId]);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !saved;
    setSaved(next);
    const ids = readLocal().filter((id) => id !== productId);
    if (next) ids.push(productId);
    writeLocal(ids);
    toast(next ? t("wishlist.added") : t("wishlist.removed"), { duration: 2500 });

    if (user) {
      apiFetch("/api/wishlist", {
        method: next ? "POST" : "DELETE",
        body: JSON.stringify({ product_id: productId }),
      }).catch(() => {});
    }
  };

  const box = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <button
      onClick={toggle}
      aria-label={saved ? t("wishlist.remove") : t("wishlist.add")}
      aria-pressed={mounted && saved}
      className={cn(
        "flex items-center justify-center rounded-md border border-border bg-card/95 shadow-card transition-[color,background-color] duration-150",
        saved ? "text-primary" : "text-muted-foreground hover:text-foreground",
        box,
        className
      )}
    >
      <Heart className={icon} weight={mounted && saved ? "fill" : "regular"} />
    </button>
  );
}