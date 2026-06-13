import type { Context, Hono } from 'hono'
import type { RelayBus } from '../relay-bus.ts'
import { streamBus } from '../sse.ts'
import type { AppEnv } from '../views.ts'

// Claude↔Claude relay: a lightweight live back-channel between two agent sessions
// on different machines. Self-authenticating via a per-channel capability token
// (no cookie / worker / project coupling), so these routes are registered BEFORE
// the cookie gate. Channels are in-memory and ephemeral (see relay-bus.ts).

const bearer = (c: Context<AppEnv>): string | null =>
  (c.req.header('authorization') ?? '').match(/^Bearer (.+)$/)?.[1] ?? null

export const registerRelayRoutes = (app: Hono<AppEnv>, relay: RelayBus): void => {
  // Open a fresh channel. No auth: the returned token IS the capability, and the
  // id is unguessable — there's nothing to protect until a channel exists.
  app.post('/relay/channels', c => {
    const { channelId, token } = relay.create()
    return c.json({ channelId, token }, 201)
  })

  // Resolve + authorize a channel from the path id and Bearer token. Returns a
  // ready error Response on failure, or null to proceed.
  const guard = (c: Context<AppEnv>): Response | null => {
    const token = bearer(c)
    if (!token) return c.json({ error: 'missing bearer token' }, 401)
    const verdict = relay.auth(c.req.param('id') ?? '', token)
    if (verdict === 'unknown') return c.json({ error: 'channel not found' }, 404)
    if (verdict === 'forbidden') return c.json({ error: 'bad channel token' }, 401)
    return null
  }

  app.post('/relay/channels/:id/messages', async c => {
    const denied = guard(c)
    if (denied) return denied
    const body = (await c.req.json()) as { from?: string; text?: string }
    if (!body.text) return c.json({ error: 'text required' }, 400)
    const msg = relay.append(c.req.param('id') ?? '', {
      from: body.from ?? 'peer',
      text: body.text,
    })
    if (!msg) return c.json({ error: 'channel not found' }, 404)
    return c.json(msg, 201)
  })

  // SSE: replay history after ?since=<seq> (0 = full buffer for a late joiner),
  // then tail live. Reuses the shared streamBus pump + replay dedupe.
  app.get('/relay/channels/:id/stream', c => {
    const denied = guard(c)
    if (denied) return denied
    const id = c.req.param('id') ?? ''
    const sinceRaw = Number(c.req.query('since') ?? '0')
    const since = Number.isNaN(sinceRaw) ? 0 : sinceRaw
    return streamBus(c, push => relay.bus.subscribe(id, push), {
      replay: { load: async () => relay.since(id, since), keyOf: m => m.seq },
    })
  })
}
