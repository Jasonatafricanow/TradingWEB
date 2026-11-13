"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ShoppingCart } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 移动端粘性购买条：主购买区滚出视口后淡入，
 * 只动 transform/opacity，不遮挡页脚（页面底部预留间距）。
 */
export function StickyBuyBar({
  title,
  imageKey,
  priceLabel,
  onAdd,
  disabled,
  ctaLabel,
}: {
  title: string;
  imageKey: string | null;
  priceLabel: string;
  onAdd: () => void;
  disabled?: boolean;
  ctaLabel: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 520);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-md transition-[transform,opacity] duration-200 lg:hidden",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
          {imageKey && <Image src={imageKey} alt="" fill sizes="44px" className="object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-medium">{title}</p>
          <p className="mt-0.5 text-[13px] font-medium tabular-nums">{priceLabel}</p>
        </div>
        <Button size="lg" onClick={onAdd} disabled={disabled} className="shrink-0">
          <ShoppingCart className="mr-1 h-4 w-4" />
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
}