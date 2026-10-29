import type { Session, User } from '@baton/shared'
import { request, type Url } from './request'

// Cookie-session auth. login mints the login cookie (the browser stores it); me
// drives the auth gate (401 → show login). openShare exchanges a share token for a
// grant to that one session — not a login; any existing login is left as is.
export type AuthApi = {
  login(username: string, password: string): Promise<{ user: User }>
  logout(): Promise<void>
  // Resolves when access is allowed (authRequired:false when no users seeded, or a
  // valid cookie); throws 401 when auth is on and the caller isn't logged in.
  me(): Promise<{ authRequired: boolean; user: User | null; hasToken: boolean }>
  openShare(token: string): Promise<{ session: Session }>
  // Self-service account management (the logged-in user, in the web).
  changePassword(oldPassword: string, newPassword: string): Promise<{ ok: boolean }>
  // Mint/rotate the personal API token (your CLI/agent's BATON_TOKEN). Shown once.
  mintToken(): Promise<{ token: string }>
}

export const authApi = (u: Url): AuthApi => ({
  login: (username, password) =>
    request(u('/auth/login'), { method: 'POST', body: { username, password } }),
  logout: () => request(u('/auth/logout'), { method: 'POST' }),
  me: () => request(u('/auth/me'), { method: 'GET' }),
  openShare: token => request(u(`/auth/share/${token}`), { method: 'POST' }),
  changePassword: (oldPassword, newPassword) =>
    request(u('/auth/password'), { method: 'POST', body: { oldPassword, newPassword } }),
  mintToken: () => request(u('/auth/token'), { method: 'POST' }),
})
