"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Key, Spinner, CheckCircle } from "@phosphor-icons/react";
import { useI18n } from "@/contexts/i18n-context";
import { SAFE_AUTH_ERROR_KEY, type TranslationKeyWithoutParams } from "@/i18n";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [errorKey, setErrorKey] = useState<TranslationKeyWithoutParams | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorKey(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();

      if (!res.ok) {
        setErrorKey(SAFE_AUTH_ERROR_KEY);
      } else {
        setSuccess(true);
        // 开发模式：显示重置链接（生产环境通过邮件发送）
        if (json.data?.token) {
          setResetToken(json.data.token);
        }
      }
    } catch {
      setErrorKey(SAFE_AUTH_ERROR_KEY);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-600">
            <Key className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="mt-4 text-2xl">{t("auth.web.forgot_title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700">
                  {t("auth.web.reset_generated")}
                </AlertDescription>
              </Alert>
              {resetToken && (
                <div className="p-3 bg-gray-50 rounded-lg border text-sm break-all">
                  <p className="font-medium text-gray-700 mb-1">🔗 {t("auth.web.reset_link")}</p>
                  <a
                    href={`/auth/reset-password?token=${resetToken}`}
                    className="text-blue-600 hover:underline"
                  >
                    {t("auth.web.reset_now")}
                  </a>
                </div>
              )}
              <div className="text-center">
                <Link href="/auth/login" className="text-sm text-blue-600 hover:underline">
                  {t("auth.web.back_to_login")}
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorKey && (
                <Alert variant="destructive">
                  <AlertDescription>{t(errorKey)}</AlertDescription>
                </Alert>
              )}

              <p className="text-sm text-gray-500">
                {t("auth.web.forgot_description")}
              </p>

              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.web.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth.web.email_placeholder")}
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                {loading ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4 animate-spin" />
                    {t("auth.web.sending")}
                  </>
                ) : (
                  t("auth.web.send_reset")
                )}
              </Button>

              <p className="text-center text-sm text-gray-500">
                <Link href="/auth/login" className="text-blue-600 hover:underline">
                  {t("auth.web.back_to_login")}
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
