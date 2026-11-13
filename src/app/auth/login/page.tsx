"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Eye, EyeSlash, Envelope, Lock, ArrowRight, Spinner, Globe,
  ShieldCheck, Truck, Briefcase, Lightning,
} from "@phosphor-icons/react";
import { GoogleLoginButton, AppleLoginButton } from "@/components/auth/oauth-buttons";
import { useI18n } from "@/contexts/i18n-context";
import { SAFE_AUTH_ERROR_KEY, type TranslationKeyWithoutParams } from "@/i18n";

export default function LoginPage() {
  const { t } = useI18n();
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[80vh] items-center justify-center px-4">
          <Spinner className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">{t("common.loading")}</span>
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}

const DEMO_ACCOUNTS = [
  { label: "Buyer", email: "demo@example.com", password: "demo123" },
  { label: "Admin", email: "admin@globaltrade.enterprise", password: "admin123" },
];

function LoginPageInner() {
  const { signIn } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/products";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKeyWithoutParams | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorKey(null);
    if (!email || !password) {
      setErrorKey("auth.web.fill_all_fields");
      return;
    }
    setLoading(true);
    try {
      const { error: signInError } = await signIn(email, password);
      if (signInError) {
        setErrorKey(SAFE_AUTH_ERROR_KEY);
      } else {
        router.push(redirectTo);
      }
    } catch {
      setErrorKey(SAFE_AUTH_ERROR_KEY);
    } finally {
      setLoading(false);
    }
  }

  const fillDemo = (acc: (typeof DEMO_ACCOUNTS)[number]) => {
    setEmail(acc.email);
    setPassword(acc.password);
    setErrorKey(null);
  };

  return (
    <div className="grid min-h-[calc(100vh-5.5rem)] lg:grid-cols-2">
      {/* ── Brand panel ── */}
      <div className="relative hidden overflow-hidden bg-[var(--footer-bg)] lg:block">
        <Image
          src="/images/catalog/cargo-ship-2.jpg"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/75 via-black/50 to-black/30" aria-hidden="true" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <Globe className="h-5 w-5 text-white" weight="bold" />
            </span>
            <span className="font-display text-[17px] font-medium text-white">
              GlobalTrade Hub
            </span>
          </Link>

          <div className="max-w-md">
            <h2 className="font-display text-balance text-4xl font-medium leading-[1.12] text-white">
              {t("auth.panel.title")}
            </h2>
            <p className="mt-5 text-pretty text-[14.5px] leading-relaxed text-white/70">
              {t("auth.panel.desc")}
            </p>
            <div className="mt-9 space-y-4">
              {[
                { Icon: Briefcase, text: t("auth.panel.point1") },
                { Icon: Truck, text: t("auth.panel.point2") },
                { Icon: ShieldCheck, text: t("auth.panel.point3") },
              ].map(({ Icon, text }) => (
                <div key={text} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white backdrop-blur-md">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[13.5px] text-white/85">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-6 border-t border-white/15 pt-6 text-white/60">
            {[
              { v: "3,268", l: t("home.metrics.customers") },
              { v: "50+", l: t("home.stats.countries") },
              { v: "4.8", l: t("home.metrics.rating") },
            ].map((s) => (
              <div key={s.l}>
                <div className="font-display text-xl font-medium text-white">{s.v}</div>
                <div className="mt-1 text-[11px]">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Form panel ── */}
      <div className="relative flex items-center justify-center overflow-hidden px-4 py-14 sm:px-8">
        <div className="relative w-full max-w-md">
          <div className="mb-8 text-center lg:text-left">
            <span className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary lg:hidden">
              <Globe className="h-6 w-6 text-white" weight="bold" />
            </span>
            <h1 className="font-display text-3xl font-medium">
              {t("auth.web.welcome_back")}
            </h1>
            <p className="mt-2.5 text-sm text-muted-foreground">
              {t("auth.web.signin_description")}
            </p>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-lift sm:p-7">
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorKey && (
                <Alert variant="destructive" className="rounded-xl">
                  <AlertDescription className="text-sm">{t(errorKey)}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.web.email")}</Label>
                <div className="relative">
                  <Envelope className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("auth.web.email_placeholder")}
                    className="pl-10"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t("auth.web.password")}</Label>
                  <Link href="/auth/forgot-password" className="text-xs font-medium text-primary hover:underline">
                    {t("auth.web.forgot_password")}
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="pl-10 pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    aria-label={t(showPassword ? "auth.web.hide_password" : "auth.web.show_password")}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? <EyeSlash className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? <Spinner className="mr-1.5 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-1.5 h-4 w-4" />}
                {loading ? t("auth.web.signing_in") : t("auth.web.sign_in")}
              </Button>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-[11px]">
                  <span className="bg-card px-3 text-muted-foreground">{t("auth.web.continue_with")}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 [&>*:only-child]:col-span-2">
                <GoogleLoginButton onSuccess={() => router.push(redirectTo)} />
                <AppleLoginButton onSuccess={() => router.push(redirectTo)} />
              </div>
            </form>
          </div>

          {/* Demo accounts */}
          <div className="mt-4 rounded-2xl border border-border bg-muted/50 p-4">
            <p className="flex items-center gap-2 text-[11.5px] font-medium text-muted-foreground">
              <Lightning className="h-3.5 w-3.5 text-primary" weight="fill" />
              {t("auth.web.demo_hint")}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => fillDemo(acc)}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-left transition-colors duration-200 hover:border-primary hover:shadow-card"
                >
                  <span className="block text-[11px] font-medium text-primary">
                    {acc.label}
                  </span>
                  <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">
                    {acc.email}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-[11px] text-muted-foreground">{t("auth.demo_fill_hint")}</p>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t("auth.web.no_account")}{" "}
            <Link href="/auth/register" className="font-medium text-primary hover:underline">
              {t("auth.web.sign_up")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}