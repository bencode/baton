import type { Hono } from 'hono'
import type { Store } from '../store/types.ts'
import type { AppEnv } from '../views.ts'

type SubscriptionBody = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }

// Browser push subscriptions for the logged-in user. publicKey is null when the
// server has no VAPID keys, which tells the web app to hide the entry.
export const registerPushRoutes = (
  app: Hono<AppEnv>,
  store: Store,
  publicKey: string | null,
): void => {
  app.get('/push/config', c => c.json({ publicKey }))
  app.post('/push/subscriptions', async c => {
    // Auth-off dev mode and worker tokens have no user to notify.
    const userId = c.get('userId')
    if (userId == null) return c.json({ error: 'a logged-in user is required' }, 403)
    const body = (await c.req.json()) as SubscriptionBody
    const { endpoint } = body
    const p256dh = body.keys?.p256dh
    const auth = body.keys?.auth
    if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string')
      return c.json({ error: 'endpoint and keys required' }, 400)
    await store.push.subscribe(userId, { endpoint, p256dh, auth })
    return c.json({ ok: true }, 201)
  })
  app.delete('/push/subscriptions', async c => {
    const { endpoint } = (await c.req.json()) as { endpoint?: unknown }
    if (typeof endpoint !== 'string') return c.json({ error: 'endpoint required' }, 400)
    await store.push.unsubscribe(endpoint)
    return c.json({ ok: true })
  })
}
