import { type Id, NOTIFY_MAX_CHARS, type NotifyResult } from '@baton/shared'
import type { Hono } from 'hono'
import { workerBearerAuth } from '../middleware/auth.ts'
import { deliverPush, type SendPush } from '../push-notifier.ts'
import type { Store } from '../store/types.ts'
import { type AppEnv, intParam } from '../views.ts'

const NOTIFY_INTERVAL_MS = 10 * 60_000

const clip = (text: string): string =>
  text.length > NOTIFY_MAX_CHARS ? `${text.slice(0, NOTIFY_MAX_CHARS - 1)}…` : text

type SubscriptionBody = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }

// Browser push subscriptions for the logged-in user. publicKey is null when the
// server has no VAPID keys, which tells the web app to hide the entry.
export const registerPushRoutes = (
  app: Hono<AppEnv>,
  store: Store,
  publicKey: string | null,
  sendPush: SendPush | null,
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

  // `baton notify`: the session's own worker (the agent inside it) pushes one line
  // to the latest human sender. Throttled per session in memory; a restart resets it.
  const lastNotified = new Map<Id, number>()
  app.post('/sessions/:id/notify', workerBearerAuth(store), async c => {
    const id = intParam(c.req.param('id'))
    const session = await store.sessions.get(id)
    if (!session) return c.json({ error: 'not found' }, 404)
    if (session.workerId !== c.get('worker').id) return c.json({ error: 'forbidden' }, 403)
    if (!sendPush) return c.json({ error: 'push is not configured' }, 503)
    const { text } = (await c.req.json()) as { text?: unknown }
    const body = typeof text === 'string' ? text.trim() : ''
    if (!body) return c.json({ error: 'text required' }, 400)
    const now = Date.now()
    const wait = (lastNotified.get(id) ?? -Infinity) + NOTIFY_INTERVAL_MS - now
    if (wait > 0)
      return c.json<NotifyResult>({ status: 'throttled', retryAfterSec: Math.ceil(wait / 1000) })
    const userIds = await store.push.latestSenders(id)
    if (userIds.length === 0) return c.json<NotifyResult>({ status: 'no_recipient' })
    const project = await store.projects.get(session.projectId)
    const devices = await deliverPush({ store, send: sendPush }, userIds, {
      title: `${project?.name ?? 'baton'} · ${session.name}`,
      body: clip(body),
      url: `/proj/${session.projectId}/session/${id}`,
      // Distinct from the turn-end tag so the two never replace each other.
      tag: `notify-${id}`,
    })
    if (devices === 0) return c.json<NotifyResult>({ status: 'no_recipient' })
    lastNotified.set(id, now)
    return c.json<NotifyResult>({ status: 'sent', devices })
  })
}
