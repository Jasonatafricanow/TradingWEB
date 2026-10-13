import { getStoredToken } from "@/contexts/auth-context"

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getStoredToken()

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  return fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } })
}

type HtmlTarget = { location: { href: string }; close(): void }

/**
 * Show an auth-protected HTML document (e.g. an invoice) in `target`, a tab
 * the click handler opened synchronously so popup blockers allow it. A plain
 * link cannot send the Bearer token, so the route would answer 401.
 */
export async function openAuthenticatedHtml(url: string, target: HtmlTarget | null): Promise<void> {
  const res = await apiFetch(url)
  if (!res.ok) {
    target?.close()
    throw new Error(`HTTP ${res.status}`)
  }
  const objectUrl = URL.createObjectURL(new Blob([await res.text()], { type: "text/html" }))
  if (target) target.location.href = objectUrl
  else window.location.assign(objectUrl)
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
}
