"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/contexts/i18n-context";
import { pushRecent } from "@/components/command-palette";

/** 是否偏好减弱动效 */
function prefersReduced() {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 数字滚动：进入视口后 600ms 内 ease-out 递增到目标值。
 * 只渲染文本，不改变布局；减弱动效时直接显示终值。
 */
export function CountUp({
  value,
  suffix = "",
  duration = 600,
  className,
}: {
  value: number;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // 默认即为真实值：未进入视口时也不会显示误导性的 0
  const [display, setDisplay] = useState(value);
  const startedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReduced()) { setDisplay(value); return; }

    let fallback = 0;
    const run = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      setDisplay(0);
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setDisplay(Math.round(value * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      // 后台标签页会节流 rAF，用定时器保证最终一定显示真实数值
      fallback = window.setTimeout(() => setDisplay(value), duration + 250);
    };

    if (typeof IntersectionObserver === "undefined") {
      run();
      return () => window.clearTimeout(fallback);
    }
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) { run(); io.disconnect(); } },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => { io.disconnect(); window.clearTimeout(fallback); };
  }, [value, duration]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {display.toLocaleString()}{suffix}
    </span>
  );
}

/** 顶部滚动进度：只改 transform，不触发布局 */
export function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = barRef.current;
      if (!el) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      el.style.transform = `scaleX(${p})`;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);

  if (pathname.startsWith("/admin")) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5" aria-hidden="true">
      <div ref={barRef} className="h-full origin-left bg-primary" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}

/** 回到顶部：滚动超过一屏后淡入 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  const { t } = useI18n();

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.9);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  if (pathname.startsWith("/admin")) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: prefersReduced() ? "auto" : "smooth" })}
      aria-label={t("common.back_to_top")}
      className={cn(
        "fixed bottom-20 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-lift transition-[opacity,transform,color] duration-200 hover:text-foreground lg:bottom-6",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      )}
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}

/** 记录最近浏览：在商品详情页挂载时写入本地存储 */
export function RecentTracker({
  id,
  title,
  imageKey,
}: {
  id: string;
  title: string;
  imageKey: string | null;
}) {
  useEffect(() => {
    if (!id || !title) return;
    pushRecent({ id, title, image_key: imageKey });
  }, [id, title, imageKey]);
  return null;
}