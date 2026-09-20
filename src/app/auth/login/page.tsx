"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeSlash, Envelope, Lock, ArrowRight, Spinner } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { GoogleLoginButton, AppleLoginButton } from "@/components/auth/oauth-buttons";
import { useI18n } from "@/contexts/i18n-context";
import { SAFE_AUTH_ERROR_KEY, type TranslationKeyWithoutParams } from "@/i18n";

export default function LoginPage() {
  const { t } = useI18n();
  return (
    <Suspense fallback={
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="text-sm text-gray-500">{t("common.loading")}</div>
      </div>
    }>
      <LoginPageInner />
    </Suspense>
  );
}

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

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
            <span className="text-lg font-bold text-white">GT</span>
          </div>
          <CardTitle className="text-2xl font-bold">{t("auth.web.welcome_back")}</CardTitle>
          <p className="text-sm text-gray-500">
            {t("auth.web.signin_description")}
          </p>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {/* Inline error message */}
            {errorKey && (
              <Alert variant="destructive">
                <AlertDescription className="text-sm">{t(errorKey)}</AlertDescription>
              </Alert>
            )}

            {/* Demo mode hint — always visible when no error, as subtle reminder */}
            {!errorKey && (
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-xs text-gray-500 space-y-1">
                <p className="font-medium text-gray-600">{t("auth.web.demo_hint")}</p>
                <p><span className="font-mono">demo@example.com</span> / <span className="font-mono">demo123</span></p>
                <p><span className="font-mono">admin@globaltrade.enterprise</span> / <span className="font-mono">admin123</span></p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.web.email")}</Label>
              <div className="relative">
                <Envelope className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
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
                <Link href="/auth/forgot-password" className="text-xs text-blue-600 hover:underline">
                  {t("auth.web.forgot_password")}
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeSlash className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              disabled={loading}
            >
              {loading ? (
                <Spinner className={cn("mr-2 h-4 w-4", "animate-spin")} />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              {loading ? t("auth.web.signing_in") : t("auth.web.sign_in")}
            </Button>

            {/* OAuth */}
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-400">{t("auth.web.continue_with")}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 [&>*:only-child]:col-span-2">
              <GoogleLoginButton onSuccess={() => router.push(redirectTo)} />
              <AppleLoginButton onSuccess={() => router.push(redirectTo)} />
            </div>
          </CardContent>
        </form>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-gray-500">
            {t("auth.web.no_account")}{" "}
            <Link href="/auth/register" className="text-blue-600 hover:underline font-semibold">
              {t("auth.web.sign_up")}
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
