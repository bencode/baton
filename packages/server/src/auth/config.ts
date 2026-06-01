// Session-cookie config, shared by the /auth routes (set) and the cookie gate
// (read). The secret signs the cookie; a fixed dev default is acceptable because
// dev runs with auth OFF (no users seeded) — set BATON_AUTH_SECRET in prod so
// cookies survive restarts and can't be forged. `secure` (HTTPS-only) follows
// NODE_ENV so dev over plain HTTP still works.
export const COOKIE_NAME = 'baton_session'
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export const authSecret = (env: NodeJS.ProcessEnv = process.env): string =>
  env.BATON_AUTH_SECRET ?? 'baton-dev-insecure-secret'

export const cookieSecure = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.NODE_ENV === 'production'
