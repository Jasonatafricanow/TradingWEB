import Image from "next/image";
import { Briefcase, FileText, Package } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * 商品缩略图：有真实图片时渲染照片（含轻微悬停推近），
 * 无图时回退到按类型着色的渐变纹理 + 玻璃图标牌。
 * 渐变令牌见 globals.css 的 .product-thumb / .thumb-*（含暗色适配）。
 */
export function ProductThumb({
  type,
  image,
  alt = "",
  className,
  iconSize = "md",
  sizes = "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw",
  priority = false,
}: {
  type: string;
  image?: string | null;
  alt?: string;
  className?: string;
  iconSize?: "md" | "lg";
  sizes?: string;
  priority?: boolean;
}) {
  const hue =
    type === "service" ? "thumb-service" : type === "physical" ? "thumb-physical" : "thumb-virtual";

  if (image) {
    return (
      <div className={cn("product-thumb absolute inset-0 overflow-hidden", hue, className)}>
        <Image
          src={image}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
        {/* 底部极轻压暗，保证叠加徽标与按钮在任何照片上都可读 */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/25 to-transparent"
          aria-hidden="true"
        />
      </div>
    );
  }

  const Icon = type === "service" ? Briefcase : type === "physical" ? Package : FileText;
  return (
    <div className={cn("product-thumb absolute inset-0 overflow-hidden", hue, className)} aria-hidden="true">
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={cn("product-thumb-icon flex items-center justify-center rounded-2xl border border-border bg-card/85 shadow-card backdrop-blur-md transition-transform duration-200 ease-out",
            iconSize === "lg" ? "h-16 w-16" : "h-14 w-14"
          )}
        >
          <Icon className={iconSize === "lg" ? "h-7 w-7" : "h-6 w-6"} weight="duotone" />
        </span>
      </div>
    </div>
  );
}