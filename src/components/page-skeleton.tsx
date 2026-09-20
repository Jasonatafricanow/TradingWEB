/**
 * 公共 PageSkeleton — 统一全站 loading 占位。
 *
 * 使用：
 *   <PageSkeleton variant="list" />     // 列表页（标题 + 表格行）
 *   <PageSkeleton variant="detail" />   // 详情页（标题 + 两栏卡片）
 *   <PageSkeleton variant="form" />     // 表单页（标题 + 多组 input）
 *   <PageSkeleton variant="grid" />     // 网格页（如商品列表）
 */
import { Skeleton } from "@/components/ui/skeleton";

interface PageSkeletonProps {
  variant?: "list" | "detail" | "form" | "grid";
  /** 自定义容器内边距，默认走 admin 标准 `p-6 lg:p-8` */
  className?: string;
}

export function PageSkeleton({ variant = "list", className }: PageSkeletonProps) {
  const wrap = className ?? "p-6 lg:p-8";

  if (variant === "detail") {
    return (
      <div className={wrap}>
        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-72 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === "form") {
    return (
      <div className={wrap}>
        <div className="mb-6 space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="space-y-4 max-w-2xl">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
    );
  }

  if (variant === "grid") {
    return (
      <div className={wrap}>
        <div className="mb-8 flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-64" />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-72 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  // list (default)
  return (
    <div className={wrap}>
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded" />
        ))}
      </div>
    </div>
  );
}
