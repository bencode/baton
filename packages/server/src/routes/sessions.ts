import type { Id, SessionEvent, SessionEventType, SessionMode } from '@baton/shared'
import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { EventBus } from '../event-bus.ts'
import type { LivenessTracker } from '../liveness.ts'
import { bearerAuth } from '../middleware/auth.ts'
import type { Store } from '../store/types.ts'
import { type AppEnv, intParam, sessionWithView } from '../views.ts'

export const registerSessionRoutes = (
  app: Hono<AppEnv>,
  store: Store,
  bus: EventBus,
  liveness: LivenessTracker,
): void => {
  const auth = bearerAuth(store)

  app.post('/sessions', async c => {
    const body = (await c.req.json()) as {
      projectId?: Id
      mode?: SessionMode
      name?: string
      claudeSessionId?: string
      worktreePath?: string
      machineId?: string
      hostname?: string
      workerName?: string
    }
    if (!body.projectId || !body.name || !body.mode)
      return c.json({ error: 'projectId, name, mode required' }, 400)
    const {
      projectId,
      mode,
      name,
      claudeSessionId,
      worktreePath,
      machineId,
      hostname,
      workerName,
    } = body
    const reg = await store.sessions.register({
      projectId,
      mode,
      name,
      claudeSessionId,
      worktreePath,
      machineId,
      hostname,
      workerName,
    })
    const view = await sessionWithView(reg, store, liveness)
    return c.json({ ...view, apiToken: reg.apiToken }, 201)
  })
  app.get('/sessions/:id', async c => {
    const s = await store.sessions.get(intParam(c.req.param('id')))
    if (!s) return c.json({ error: 'not found' }, 404)
    return c.json(await sessionWithView(s, store, liveness))
  })
  app.get('/sessions/:id/events', async c =>
    c.json(await store.sessions.listEvents(intParam(c.req.param('id')))),
  )

  // Worker-private (bearer). turn_start / turn_complete / turn_error don't
  // flip persistent state anymore — busy is derived from the event log.
  app.post('/sessions/me/close', auth, async c => {
    const session = c.get('session')
    await store.sessions.close(session.id)
    return c.body(null, 204)
  })
  app.post('/sessions/me/events', auth, async c => {
    const session = c.get('session')
    const body = (await c.req.json()) as { type?: SessionEventType; payload?: unknown }
    if (!body.type) return c.json({ error: 'type required' }, 400)
    if (body.type === 'turn_start') {
      const messageId = (body.payload as { messageId?: number } | undefined)?.messageId
      if (typeof messageId === 'number') await store.sessions.markMessageProcessed(messageId)
    }
    const ev = await store.sessions.appendEvent(session.id, body.type, body.payload ?? null)
    bus.publish(session.id, ev)
    return c.json(ev, 201)
  })

  // Chat ingress (UI / CLI, no auth in v0). Records the user_message and
  // publishes it; the subscribed worker (via SSE) picks it up and runs a turn.
  app.post('/sessions/:id/messages', async c => {
    const sessionId = intParam(c.req.param('id'))
    const session = await store.sessions.get(sessionId)
    if (!session) return c.json({ error: 'not found' }, 404)
    if (session.closedAt) return c.json({ error: 'session closed' }, 409)
    const body = (await c.req.json()) as { text?: string }
    if (typeof body.text !== 'string' || body.text.length === 0)
      return c.json({ error: 'text required' }, 400)
    const ev = await store.sessions.appendEvent(sessionId, 'user_message', { text: body.text })
    bus.publish(sessionId, ev)
    return c.json(ev, 201)
  })

  // Live tail. Replays history (so late joiners / refreshes get the full
  // thread) then subscribes to the bus. A 30s `:keepalive` ping keeps proxies
  // happy.
  app.get('/sessions/:id/stream', async c => {
    const id = intParam(c.req.param('id'))
    const exists = await store.sessions.get(id)
    if (!exists) return c.json({ error: 'not found' }, 404)
    const signal = c.req.raw.signal
    return streamSSE(c, async stream => {
      const history = await store.sessions.listEvents(id)
      for (const e of history) {
        if (signal.aborted) return
        await stream.writeSSE({ data: JSON.stringify(e) })
      }
      let resolve = (): void => {}
      const pending: SessionEvent[] = []
      const wake = () => {
        const r = resolve
        resolve = () => {}
        r()
      }
      const unsub = bus.subscribe(id, e => {
        pending.push(e)
        wake()
      })
      signal.addEventListener('abort', wake)
      const keepalive = setInterval(() => {
        if (signal.aborted) return
        // SSE comment line; clients ignore but proxies keep the connection open.
        stream.write(': keepalive\n\n').catch(() => {})
      }, 30_000)
      try {
        while (!signal.aborted) {
          while (pending.length > 0 && !signal.aborted) {
            const e = pending.shift()
            if (e) await stream.writeSSE({ data: JSON.stringify(e) })
          }
          if (signal.aborted) break
          await new Promise<void>(r => {
            resolve = r
          })
        }
      } finally {
        clearInterval(keepalive)
        unsub()
        signal.removeEventListener('abort', wake)
      }
    })
  })
}
