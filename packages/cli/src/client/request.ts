export type ReqInit = { method: string; body?: unknown; headers?: Record<string, string> }

// Cross-cutting auth for the gated back-office routes: when BATON_USER/PASS are
// set, createClient primes a one-time login (see client/auth.ts) that resolves
// `loginGate` after stashing the session cookie in `authHeaders`. Every request
// awaits the gate, so the cookie is attached before any real call fires. With no
// creds configured the gate stays null and this is a no-op (worker-bearer routes
// are exempt from the gate anyway).
let authHeaders: Record<string, string> = {}
let loginGate: Promise<void> | null = null
export const setAuthHeaders = (h: Record<string, string>): void => {
  authHeaders = h
}
export const setLoginGate = (p: Promise<void>): void => {
  loginGate = p
}

// Shared HTTP helper for every per-resource sub-client. Throws on non-2xx and
// transparently handles 204 (DELETE / close).
export const request = async <T>(url: string, init: ReqInit): Promise<T> => {
  if (loginGate) await loginGate
  const baseHeaders: Record<string, string> =
    init.body !== undefined ? { 'content-type': 'application/json' } : {}
  const res = await fetch(url, {
    method: init.method,
    headers: { ...baseHeaders, ...authHeaders, ...(init.headers ?? {}) },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })
  if (!res.ok) throw new Error(`${init.method} ${url} → ${res.status}: ${await res.text()}`)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
