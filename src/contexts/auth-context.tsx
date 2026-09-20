"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

interface LocalUser {
  id: string
  email: string
  name?: string | null
}

interface AuthContextType {
  user: LocalUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  getToken: () => string | null;
  setSession: (token: string, user: LocalUser) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
  getToken: () => null,
  setSession: () => {},
});

const TOKEN_KEY = "tradingweb_auth_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, check stored token
  useEffect(() => {
    const token = getStoredToken()
    if (!token) {
      setLoading(false)
      return
    }

    fetch("/api/auth/me", {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          clearStoredToken()
          return null
        }
        return res.json()
      })
      .then((json) => {
        setUser(json?.data || null)
      })
      .catch(() => {
        clearStoredToken()
      })
      .finally(() => setLoading(false))
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const json = await res.json()
      if (!res.ok) {
        return { error: json.error || "登录失败" }
      }
      setStoredToken(json.data.token)
      setUser(json.data.user)
      return { error: null }
    } catch {
      return { error: "网络错误，请重试" }
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, ...(name ? { name } : {}) }),
      })
      const json = await res.json()
      if (!res.ok) {
        return { error: json.error || "注册失败" }
      }
      setStoredToken(json.data.token)
      setUser(json.data.user)
      return { error: null }
    } catch {
      return { error: "网络错误，请重试" }
    }
  }, [])

  const signOut = useCallback(async () => {
    clearStoredToken()
    setUser(null)
  }, [])

  const getToken = useCallback(() => {
    return getStoredToken()
  }, [])

  const setSession = useCallback((token: string, nextUser: LocalUser) => {
    setStoredToken(token)
    setUser(nextUser)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, getToken, setSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
