import type { Id } from './ids.ts'

// A back-office login user (username/password → session cookie). The public
// view never carries the password hash — that stays server-side in the store's
// UserRecord. Added pre-deploy; see the cookie-auth gate (auth is enforced only
// once at least one user exists).
export type User = {
  id: Id
  username: string
  // Admin sees every workspace; non-admins are scoped to their bound workspaces.
  isAdmin: boolean
  createdAt: number
}
