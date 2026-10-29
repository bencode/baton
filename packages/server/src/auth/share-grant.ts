import type { Id, Session } from '@baton/shared'
import type { Context } from 'hono'
import { getSignedCookie, setSignedCookie } from 'hono/cookie'
import type { Store } from '../store/types.ts'
import type { AppEnv } from '../views.ts'
import { authSecret, cookieSecure } from './config.ts'

// A share link grants access to ONE session — never a user identity. The grant
// rides its own per-session cookie (so tabs sharing different sessions don't
// clobber each other, and a logged-in baton_session is left untouched). It
// carries the share token itself and is re-checked against the session's current
// shareToken on every request. No maxAge: the /s/:token page re-exchanges on load.
export const shareCookieName = (sessionId: Id): string => `baton_share_${sessionId}`

export const setShareGrant = (c: Context<AppEnv>, session: Session): Promise<void> =>
  setSignedCookie(c, shareCookieName(session.id), session.shareToken ?? '', authSecret(), {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: cookieSecure(),
  })

export const hasShareGrant = async (
  c: Context<AppEnv>,
  store: Store,
  sessionId: Id,
): Promise<boolean> => {
  const token = await getSignedCookie(c, authSecret(), shareCookieName(sessionId))
  if (!token) return false
  const session = await store.sessions.get(sessionId)
  return session?.shareToken === token
}
