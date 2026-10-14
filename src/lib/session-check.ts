/**
 * Whether a /api/auth/me response means the stored token is no longer valid.
 *
 * Only an explicit rejection ends the session. Network errors, requests
 * aborted by a reload or navigation, and server errors (5xx) are transient
 * and must not sign the user out.
 */
export function isSessionRejected(status: number): boolean {
  return status === 401 || status === 403
}
