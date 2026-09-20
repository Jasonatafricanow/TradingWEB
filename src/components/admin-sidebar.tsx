"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client-api";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  SignOut,
  Globe,
  CaretDown,
} from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ADMIN_NAV_GROUPS,
  expandForPathname,
  filterNavigationForRole,
  initialExpandedGroupIds,
  isNavigationItemActive,
  toggleExpandedGroup,
} from "@/components/admin-navigation";
import type { TranslationKey } from "@/i18n";
import type { Locale } from "@/contexts/i18n-context";

const localeLabelKeys: Record<Locale, TranslationKey> = {
  zh: "language.zh",
  en: "language.en",
  pt: "language.pt",
};

const roleLabelKeys: Record<string, TranslationKey> = {
  admin: "role.admin",
  operator: "role.operator",
  support: "role.support",
};

export function AdminSidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [staffName, setStaffName] = useState<string | null>(null);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() =>
    initialExpandedGroupIds(pathname),
  );

  useEffect(() => {
    apiFetch("/api/admin/staff/me")
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          // 非 staff 用户或无后台权限 → 跳回首页
          toast.error(t("errors.access_denied"));
          router.replace("/");
          return null;
        }
        return res.json();
      })
      .then((json) => {
        if (json?.data) {
          setStaffRole(json.data.role);
          setStaffName(json.data.name);
        }
      })
      .catch(() => { /* 网络错误静默忽略，角色保持 null */ });
  }, [router]);

  useEffect(() => {
    setExpandedGroupIds((current) => expandForPathname(current, pathname));
  }, [pathname]);

  const navGroups = filterNavigationForRole(ADMIN_NAV_GROUPS, staffRole);

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-white shadow-sm">
      {/* Header */}
      <div className="flex h-16 items-center gap-3 border-b px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
          <span className="text-sm font-bold text-white">GT</span>
        </div>
        <div>
          <div className="text-sm font-bold text-gray-900">GlobalTrade</div>
          <div className="text-xs text-muted-foreground">{t("nav.admin_title")}</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2.5">
        {navGroups.map((group) => {
          const open = expandedGroupIds.has(group.id);
          return (
            <Collapsible
              key={group.id}
              open={open}
              onOpenChange={() =>
                setExpandedGroupIds((current) => toggleExpandedGroup(current, group.id))
              }
              className="mb-1"
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <span>{t(group.labelKey)}</span>
                  <CaretDown
                    className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-4 space-y-0.5 border-l border-gray-200 pl-2">
                  {group.items.map((item) => {
                    const isActive = isNavigationItemActive(item, pathname);
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          isActive
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        }`}
                      >
                        <item.icon className="h-4 w-4 shrink-0" weight={isActive ? "fill" : "regular"} />
                        {t(item.labelKey)}
                      </Link>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </nav>

      <Separator />

      {/* Footer */}
      <div className="space-y-1 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 px-3"
            >
              <Globe className="h-4 w-4" />
              {t(localeLabelKeys[locale])}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(Object.keys(localeLabelKeys) as Locale[]).map((loc) => (
              <DropdownMenuItem
                key={loc}
                onClick={() => setLocale(loc)}
                className={locale === loc ? "bg-accent" : ""}
              >
                {t(localeLabelKeys[loc])}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Link href="/">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 px-3"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("nav.back_to_site")}
          </Button>
        </Link>

        {user ? (
          <div className="space-y-1">
            {staffRole && staffName && (
              <div className="px-3 py-1 flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  staffRole === 'admin' ? 'bg-purple-100 text-purple-700' :
                  staffRole === 'operator' ? 'bg-blue-100 text-blue-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {staffName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t(roleLabelKeys[staffRole] ?? "role.support")}
                </span>
              </div>
            )}
            <div className="px-3 py-1 text-xs text-muted-foreground truncate">
              {user.email}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 px-3 text-red-600 hover:text-red-700"
              onClick={signOut}
            >
              <SignOut className="h-4 w-4" />
              {t("nav.logout")}
            </Button>
          </div>
        ) : (
          <Link href="/auth/login">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 px-3"
            >
              {t("nav.login")}
            </Button>
          </Link>
        )}
      </div>
    </aside>
  );
}
