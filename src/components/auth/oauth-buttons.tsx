"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { toast } from "sonner"
import { useI18n } from "@/contexts/i18n-context"

interface UserInfo {
  id: string
  email: string
  name?: string | null
}

interface GoogleCredentialResponse {
  credential?: string
  select_by?: string
}

interface GoogleIdentityClient {
  initialize: (options: {
    client_id: string
    callback: (response: GoogleCredentialResponse) => void
    auto_select?: boolean
    cancel_on_tap_outside?: boolean
  }) => void
  prompt: (momentListener?: (notification: unknown) => void) => void
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleIdentityClient
      }
    }
    AppleID?: {
      auth: {
        signIn: (options: {
          clientId: string
          redirectURI: string
          scope: string
          usePopup: boolean
        }) => Promise<{
          authorization: { code: string }
          user?: { name?: string; email?: string }
        }>
      }
    }
  }
}

async function finishOAuthLogin(
  credential: string,
  setSession: (token: string, user: UserInfo) => void,
  onSuccess: (user: UserInfo) => void,
): Promise<void> {
  const res = await fetch("/api/auth/oauth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error)

  setSession(json.data.token, json.data.user)
  onSuccess(json.data.user)
}

export function GoogleLoginButton({ onSuccess }: { onSuccess: (user: UserInfo) => void }) {
  const [loading, setLoading] = useState(false)
  const { setSession } = useAuth()
  const { t } = useI18n()
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  if (!googleClientId) return null
  const configuredGoogleClientId = googleClientId

  async function handleGoogleLogin() {
    setLoading(true)
    try {
      const googleId = window.google?.accounts?.id
      if (!googleId) {
        throw new Error("Google Identity Services SDK is not loaded")
      }

      googleId.initialize({
        client_id: configuredGoogleClientId,
        auto_select: false,
        cancel_on_tap_outside: true,
        callback: async (response) => {
          try {
            if (!response.credential) throw new Error("Missing Google credential")
            await finishOAuthLogin(response.credential, setSession, onSuccess)
          } catch (err) {
            console.error("Google login failed:", err)
            toast.error(t("auth.oauth.google_failed"))
          } finally {
            setLoading(false)
          }
        },
      })
      googleId.prompt((notification) => {
        setLoading(false)
        // prompt 被用户关闭或失败（非 credential 回调路径）
        if (notification && (notification as { isNotDisplayed?: boolean }).isNotDisplayed) {
          // 用户已通过 One Tap 关闭，不打扰
          return
        }
      })
    } catch (err) {
      console.error("Google init failed:", err)
      toast.error(t("auth.oauth.google_failed"))
      setLoading(false)
    }
  }

  return (
    <Button
      variant="outline"
      className="flex w-full items-center justify-center gap-2"
      onClick={handleGoogleLogin}
      disabled={loading}
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
      {loading ? t("auth.oauth.connecting") : t("auth.oauth.google")}
    </Button>
  )
}

export function AppleLoginButton({ onSuccess }: { onSuccess: (user: UserInfo) => void }) {
  const [loading, setLoading] = useState(false)
  const { setSession } = useAuth()
  const { t } = useI18n()
  const clientId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID
  const redirectUri = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI || (typeof window !== "undefined" ? `${window.location.origin}/auth/login` : "")

  if (!clientId) return null
  const configuredAppleClientId = clientId

  async function handleAppleLogin() {
    setLoading(true)
    try {
      const AppleID = window.AppleID
      if (!AppleID) {
        throw new Error("Apple Sign In SDK is not loaded")
      }

      const response = await AppleID.auth.signIn({
        clientId: configuredAppleClientId,
        redirectURI: redirectUri,
        scope: "name email",
        usePopup: true,
      })

      const res = await fetch("/api/auth/oauth/apple", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorizationCode: response.authorization.code,
          redirectUri,
          user: response.user,
        }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)

      setSession(json.data.token, json.data.user)
      onSuccess(json.data.user)
    } catch (err) {
      console.error("Apple login failed:", err)
      toast.error(t("auth.oauth.apple_failed"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="outline"
      className="flex w-full items-center justify-center gap-2"
      onClick={handleAppleLogin}
      disabled={loading}
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
      {loading ? t("auth.oauth.connecting") : t("auth.oauth.apple")}
    </Button>
  )
}
