import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useApi } from '../../app/api-context'
import { useAsync } from '../../hooks/use-async'

// Back-office auth gate. Probes GET /auth/me: it resolves when access is allowed
// (auth off — no users seeded — or a valid session cookie) and throws 401 when
// auth is on and we're not logged in. So: pending → spinner, resolved → app,
// rejected → /login. Cheap and uniform; no per-route checks anywhere else.
export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const api = useApi()
  const { loading, error } = useAsync(() => api.auth.me(), 'auth-me')
  if (loading)
    return <div className="grid h-screen place-items-center text-sm text-gray-400">…</div>
  if (error) return <Navigate to="/login" replace />
  return <>{children}</>
}
