"use client";

export const dynamic = "force-dynamic"


import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldCheck, Spinner } from "@phosphor-icons/react";
import { useI18n } from "@/contexts/i18n-context";
import { SAFE_AUTH_ERROR_KEY, type TranslationKeyWithoutParams } from "@/i18n";

function ResetPasswordForm() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorKey, setErrorKey] = useState<TranslationKeyWithoutParams | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [tokenError, setTokenError] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenError(true);
      setErrorKey("auth.web.invalid_token");
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorKey(null);

    if (password !== confirmPassword) {
      setErrorKey("auth.web.password_mismatch");
      return;
    }

    if (password.length < 6) {
      setErrorKey("auth.web.password_min");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        setErrorKey(SAFE_AUTH_ERROR_KEY);
      } else {
        setSuccess(true);
      }
    } catch {
      setErrorKey(SAFE_AUTH_ERROR_KEY);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-600">
          <ShieldCheck className="h-6 w-6 text-white" />
        </div>
        <CardTitle className="mt-4 text-2xl">{t("auth.web.reset_title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {success ? (
          <div className="space-y-4 text-center">
            <Alert className="bg-green-50 border-green-200">
              <AlertDescription className="text-green-700 text-base">
                ✅ {t("auth.web.reset_success")}
              </AlertDescription>
            </Alert>
            <p className="text-sm text-gray-500">{t("auth.web.reset_success_description")}</p>
            <Button
              onClick={() => router.push("/auth/login")}
              className="bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              {t("auth.web.go_to_login")}
            </Button>
          </div>
        ) : tokenError ? (
          <div className="space-y-4 text-center">
            <Alert variant="destructive">
              <AlertDescription>{errorKey ? t(errorKey) : null}</AlertDescription>
            </Alert>
            <Link
              href="/auth/forgot-password"
              className="text-sm text-blue-600 hover:underline"
            >
              {t("auth.web.request_reset_again")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorKey && (
              <Alert variant="destructive">
                <AlertDescription>{t(errorKey)}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.web.new_password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.web.password_min_placeholder")}
                required
                minLength={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("auth.web.confirm_new_password")}</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("auth.web.repeat_password")}
                required
                minLength={6}
              />
            </div>

            <Button
              type="submit"
              disabled={loading || !token}
              className="w-full bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              {loading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4 animate-spin" />
                  {t("auth.web.resetting")}
                </>
              ) : (
                t("auth.web.reset_now")
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4">
      <Suspense fallback={
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("common.loading")}
          </CardContent>
        </Card>
      }>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
