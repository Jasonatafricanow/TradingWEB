"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { AdminSidebar } from "@/components/admin-sidebar";
import { ErrorBoundary } from "@/components/error-boundary";
import { Breadcrumb } from "./_components/Breadcrumb";
import { BreadcrumbProvider } from "./_components/breadcrumb-context";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { List } from "@phosphor-icons/react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t } = useI18n();

  // ── 鉴权闸门：未登录 → 跳登录页，带 redirect 回跳 ──
  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/auth/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, router, pathname]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500">
        {t("common.loading")}
      </div>
    );
  }

  if (!user) return null; // 等 redirect

  return (
    <BreadcrumbProvider>
      {/* Mobile header bar */}
      <div className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4 md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={t("admin.mobile_menu")}
            >
              <List className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <AdminSidebar />
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-600">
            <span className="text-xs font-bold text-white">GT</span>
          </div>
          <span className="text-sm font-bold text-gray-900">{t("admin.brand")}</span>
        </div>
      </div>

      <div className="flex h-screen overflow-hidden bg-gray-50">
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <AdminSidebar />
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
          <div className="mx-auto max-w-7xl p-6 lg:p-8">
            <ErrorBoundary resetKey={pathname}>
              {children}
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </BreadcrumbProvider>
  );
}
