import { getStoredToken } from "@/contexts/auth-context"

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getStoredToken()

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  return fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } })
}
