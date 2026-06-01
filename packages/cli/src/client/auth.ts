import { setAuthHeaders, setLoginGate } from './request.ts'

// One-time transparent login for the CLI. If BATON_USER/BATON_PASS are set we
// exchange them for a session cookie and stash it for every later request (via
// the request module's login gate). Idempotent per process; a no-op without
// creds (dev / auth-off, and the worker-bearer paths are exempt regardless).
let primed = false

export const primeLogin = (baseUrl: string): void => {
  if (primed) return
  primed = true
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
      const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
      if (res.ok && cookie) setAuthHeaders({ cookie })
    })().catch(() => {}),
  )
}
