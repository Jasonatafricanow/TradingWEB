"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeSlash, Envelope, Lock, User, ArrowRight, Spinner } from "@phosphor-icons/react";
import { GoogleLoginButton, AppleLoginButton } from "@/components/auth/oauth-buttons";
import { useI18n } from "@/contexts/i18n-context";
import { SAFE_AUTH_ERROR_KEY, type TranslationKeyWithoutParams } from "@/i18n";

export default function RegisterPage() {
  const { signUp } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKeyWithoutParams | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorKey(null);
    if (!name || !email || !password) {
      setErrorKey("auth.web.fill_all_fields");
      return;
    }
    if (password.length < 6) {
      setErrorKey("auth.web.password_min");
      return;
    }
    if (password !== confirmPassword) {
      setErrorKey("auth.web.password_mismatch");
      return;
    }
    setLoading(true);
    try {
      const { error: signUpError } = await signUp(email, password, name);
      if (signUpError) {
        setErrorKey(SAFE_AUTH_ERROR_KEY);
      } else {
        router.push("/products");
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
          <CardTitle className="text-2xl font-bold">{t("auth.web.create_account")}</CardTitle>
          <p className="text-sm text-gray-500">
            {t("auth.web.register_description")}
          </p>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {errorKey && (
              <Alert variant="destructive">
                <AlertDescription className="text-sm">{t(errorKey)}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">{t("auth.web.name")}</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  id="name"
                  placeholder={t("auth.web.your_name")}
                  className="pl-10"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>
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
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.web.password")}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("auth.web.password_min_placeholder")}
                  className="pl-10 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
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
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("auth.web.confirm_password")}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder={t("auth.web.repeat_password")}
                  className="pl-10"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              disabled={loading}
            >
              {loading ? (
                <Spinner className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              {loading ? t("auth.web.creating_account") : t("auth.web.create_account")}
            </Button>

            {/* OAuth */}
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-400">{t("auth.web.signup_with")}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 [&>*:only-child]:col-span-2">
              <GoogleLoginButton onSuccess={() => router.push("/products")} />
              <AppleLoginButton onSuccess={() => router.push("/products")} />
            </div>
          </CardContent>
        </form>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-gray-500">
            {t("auth.web.has_account")}{" "}
            <Link href="/auth/login" className="text-blue-600 hover:underline font-semibold">
              {t("auth.web.sign_in")}
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
