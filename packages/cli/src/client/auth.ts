import { setAuthHeaders, setLoginGate } from './request.ts'

// One-time transparent auth for the CLI. Prefer a personal API token
// (BATON_TOKEN → Authorization: Bearer); else exchange BATON_USER/PASS for a
// session cookie. Idempotent per process; a no-op without either (dev / auth-off,
// and the worker-bearer paths are exempt regardless).
let primed = false

export const primeLogin = (baseUrl: string): void => {
  if (primed) return
  primed = true
  const token = process.env.BATON_TOKEN
  if (token) {
    setAuthHeaders({ authorization: `Bearer ${token}` })
    return
  }
  const username = process.env.BATON_USER
  const password = process.env.BATON_PASS
  if (!username || !password) return
  setLoginGate(
    (async () => {
      // Raw fetch (not the shared `request`) so this can't await its own gate.
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      // undici exposes Set-Cookie only via getSetCookie() — get('set-cookie') is null.
      const cookie = (res.headers.getSetCookie()[0] ?? '').split(';')[0]
      if (res.ok && cookie) setAuthHeaders({ cookie })
    })().catch(() => {}),
  )
}
