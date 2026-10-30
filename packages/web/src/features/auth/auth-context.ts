import { createContext, useContext } from 'react'
import type { AuthApi } from '../../api/auth'

export type AuthState = Awaited<ReturnType<AuthApi['me']>>

export const AuthContext = createContext<AuthState | null>(null)

export const useAuth = (): AuthState => {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used within an AuthContext provider')
  return auth
}

export const authCacheScope = (auth: AuthState): string =>
  auth.user ? `user-${auth.user.id}` : 'local'
