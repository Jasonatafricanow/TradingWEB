"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AuthProvider, getStoredToken } from "@/contexts/auth-context";
import { I18nProvider } from "@/contexts/i18n-context";
import { CurrencyProvider } from "@/contexts/currency-context";
import { CartProvider } from "@/contexts/cart-context";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/error-boundary";
import { PortalContainerInit } from "@/lib/portal-utils";

/** 页面访问埋点 */
function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // 跳过管理后台的访问记录
    if (pathname.startsWith("/admin")) return;

    // 生成或获取访客 ID
    let visitorId = localStorage.getItem("visitor_id");
    if (!visitorId) {
      visitorId = `v_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem("visitor_id", visitorId);
    }

    // ── 捕获 UTM / 推广参数 ──
    const params = new URLSearchParams(window.location.search);
    const hasUtm = params.get("utm_source") || params.get("fbclid") || params.get("igshid");

    if (hasUtm) {
      // URL 带推广参数：写入（覆盖旧值）
      const attribution = {
        utm_source: params.get("utm_source") || null,
        utm_medium: params.get("utm_medium") || null,
        utm_campaign: params.get("utm_campaign") || null,
        utm_content: params.get("utm_content") || null,
        fbclid: params.get("fbclid") || null,
        igshid: params.get("igshid") || null,
        referrer: document.referrer || null,
        first_landing: pathname,
        landing_at: new Date().toISOString(),
      };
      localStorage.setItem("attribution", JSON.stringify(attribution));
    } else if (!localStorage.getItem("attribution")) {
      // 无 UTM 且从未存过：存基础来源
      const attribution = {
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        utm_content: null,
        fbclid: null,
        igshid: null,
        referrer: document.referrer || null,
        first_landing: pathname,
        landing_at: new Date().toISOString(),
      };
      localStorage.setItem("attribution", JSON.stringify(attribution));
    }

    // 读取 attribution 构造 pageview payload
    let attributionPayload: Record<string, string | undefined> = {};
    try {
      const stored = localStorage.getItem("attribution");
      if (stored) {
        const a = JSON.parse(stored);
        attributionPayload = {
          utm_source: a.utm_source || undefined,
          utm_medium: a.utm_medium || undefined,
          utm_campaign: a.utm_campaign || undefined,
          utm_content: a.utm_content || undefined,
        };
      }
    } catch {
      // 忽略解析错误
    }

    const pageTitle = document.title || pathname;

    fetch("/api/track/pageview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-visitor-id": visitorId,
      },
      body: JSON.stringify({
        path: pathname,
        title: pageTitle,
        referrer: document.referrer || undefined,
        ...attributionPayload,
      }),
    }).catch(() => {
      // 静默失败，不影响用户体验
    });
  }, [pathname]);

  return null;
}

const AUTH_REQUIRED_API_PREFIXES = [
  "/api/admin",
  "/api/addresses",
  "/api/affiliates",
  "/api/chat/send",
  "/api/coupons/validate",
  "/api/memberships",
  "/api/notifications",
  "/api/orders",
  "/api/payment/create",
  "/api/refunds",
  "/api/upload",
  "/api/wallet",
  "/api/wishlist",
];

function AuthenticatedFetchBridge() {
  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      const parsed = new URL(url, window.location.origin);
      const shouldAttachToken =
        parsed.origin === window.location.origin &&
        AUTH_REQUIRED_API_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix));

      if (!shouldAttachToken) {
        return nativeFetch(input, init);
      }

      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      if (!headers.has("authorization")) {
        const token = getStoredToken();
        if (token) {
          headers.set("authorization", `Bearer ${token}`);
        }
      }

      return nativeFetch(input, { ...init, headers });
    }) as typeof window.fetch;

    return () => {
      window.fetch = nativeFetch;
    };
  }, []);

  return null;
}

/** 根据路由条件渲染不同的页面外壳 */
function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  if (isAdmin) {
    // 管理后台：不渲染 Navbar/Footer，由各管理页面自行处理 AdminSidebar
    return <main className="flex-1">{children}</main>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

import { ThemeProvider } from "@/contexts/theme-context";

export function ClientProviders({ children, activeTheme }: { children: React.ReactNode; activeTheme: string }) {
  // 全局安全网：捕获 DOM removeChild 错误（Radix Portal 竞争条件）
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      if (
        event.error?.name === "NotFoundError" &&
        String(event.message).includes("removeChild")
      ) {
        event.preventDefault();
        console.warn(
          "[SafetyNet] Suppressed DOM removeChild NotFoundError (Radix Portal race)",
          event.message
        );
      }
    };
    window.addEventListener("error", handler);
    return () => window.removeEventListener("error", handler);
  }, []);

  const pathname = usePathname();

  return (
    <ErrorBoundary resetKey={pathname}>
      <PortalContainerInit />
    <I18nProvider>
      <CurrencyProvider>
      <AuthProvider>
        <CartProvider>
          <ThemeProvider theme={activeTheme}>
            <PageViewTracker />
            <AuthenticatedFetchBridge />
            <AppShell>
              {children}
            </AppShell>
            <Toaster duration={6000} />
          </ThemeProvider>
        </CartProvider>
      </AuthProvider>
      </CurrencyProvider>
    </I18nProvider>
    </ErrorBoundary>
  );
}

