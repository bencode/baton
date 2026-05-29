import type { AgentKind, Id, SessionEvent, SessionEventType, SessionMode } from '@baton/shared'
import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { EventBus } from '../event-bus.ts'
import type { LivenessTracker } from '../liveness.ts'
import { bearerAuth } from '../middleware/auth.ts'
import type { Store } from '../store/types.ts'
import { type AppEnv, intParam, sessionWithView } from '../views.ts'

// ~8MB base64 ≈ ~6MB raw image; enough for screenshots, bounded for the log.
const MAX_IMAGE_DATA_URL = 8_000_000

export const registerSessionRoutes = (
  app: Hono<AppEnv>,
  store: Store,
  bus: EventBus,
  workerLiveness: LivenessTracker,
  sessionLiveness: LivenessTracker,
): void => {
  const auth = bearerAuth(store)

  app.post('/sessions', async c => {
    const body = (await c.req.json()) as {
      projectId?: Id
      workerId?: Id
      mode?: SessionMode
      name?: string
      agentKind?: AgentKind
      agentSessionId?: string
      worktreePath?: string
    }
    if (
      !body.projectId ||
      !body.workerId ||
      !body.name ||
      !body.mode ||
      !body.agentKind ||
      !body.agentSessionId ||
      !body.worktreePath
    )
      return c.json(
        {
          error:
            'projectId, workerId, name, mode, agentKind, agentSessionId, worktreePath required',
        },
        400,
      )
    // Validate worker exists + belongs to this project. (No closed check —
    // workers don't have a closed state; destroy = DELETE.)
    const worker = await store.workers.get(body.workerId)
    if (!worker || worker.projectId !== body.projectId)
      return c.json({ error: 'worker not found in project' }, 404)
    const reg = await store.sessions.register({
      projectId: body.projectId,
      workerId: body.workerId,
      mode: body.mode,
      name: body.name,
      agentKind: body.agentKind,
      agentSessionId: body.agentSessionId,
      worktreePath: body.worktreePath,
    })
    const view = await sessionWithView(reg, store, workerLiveness, sessionLiveness)
    return c.json({ ...view, apiToken: reg.apiToken }, 201)
  })
  app.get('/sessions/:id', async c => {
    const s = await store.sessions.get(intParam(c.req.param('id')))
    if (!s) return c.json({ error: 'not found' }, 404)
    return c.json(await sessionWithView(s, store, workerLiveness, sessionLiveness))
  })
  app.get('/sessions/:id/events', async c =>
    c.json(await store.sessions.listEvents(intParam(c.req.param('id')))),
  )

  // Session-private (bearer). Daemon pings this every 30s alongside the
  // worker-level /workers/heartbeat. Server uses it to distinguish 'machine
  // online' from 'this specific session has a live daemon attached' so the
  // UI can flag 'message will queue with no one to process' clearly.
  app.post('/sessions/me/heartbeat', auth, async c => {
    const session = c.get('session')
    sessionLiveness.ping(String(session.id))
    return c.json({ attached: true })
  })

  // Session DELETE (bearer). Drops the row; SessionEvent rows cascade.
  // Irreversible — only the daemon (which holds the apiToken) can call this.
  app.delete('/sessions/me', auth, async c => {
    const session = c.get('session')
    await store.sessions.destroy(session.id)
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
    const body = (await c.req.json()) as { text?: string; images?: unknown }
    const text = typeof body.text === 'string' ? body.text : ''
    const images = Array.isArray(body.images)
      ? body.images.filter((i): i is string => typeof i === 'string')
      : []
    if (text.length === 0 && images.length === 0)
      return c.json({ error: 'text or images required' }, 400)
    // Inline base64 data URLs live in the event log; cap so a single paste can't
    // bloat the DB / SSE stream unbounded.
    if (images.some(i => i.length > MAX_IMAGE_DATA_URL))
      return c.json({ error: 'image too large (max ~8MB)' }, 413)
    const payload = images.length > 0 ? { text, images } : { text }
    const ev = await store.sessions.appendEvent(sessionId, 'user_message', payload)
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
