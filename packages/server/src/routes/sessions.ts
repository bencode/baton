import type { AgentKind, Id, SessionEvent, SessionEventType, SessionMode } from '@baton/shared'
import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { BusyTracker } from '../busy.ts'
import type { EventBus } from '../event-bus.ts'
import type { LivenessTracker } from '../liveness.ts'
import { bearerAuth } from '../middleware/auth.ts'
import type { Store } from '../store/types.ts'
import { type AppEnv, intParam, sessionWithView } from '../views.ts'

// ~8MB base64 ≈ ~6MB raw image; enough for screenshots, bounded for the SSE
// stream. We don't persist them anymore (browser does), but a runaway paste
// still hurts everyone subscribed to the live stream.
const MAX_IMAGE_DATA_URL = 8_000_000

// Ephemeral event identity. Session events are no longer persisted server-side
// (the browser stores them per-session in IndexedDB). To keep the SSE wire
// format identical for clients, we synthesize `id`, `sequence`, and `createdAt`
// in memory at publish time.
//
// Sequence counters are per-(server-lifetime × session). On server restart
// they reset to 0 — harmless because there's no history replay to dedupe
// against; SSE clients only dedupe within a single connection.
let nextEphemeralId = 1
const sessionSeq = new Map<Id, number>()
const nextSeq = (sessionId: Id): number => {
  const cur = (sessionSeq.get(sessionId) ?? -1) + 1
  sessionSeq.set(sessionId, cur)
  return cur
}

const synthesize = (sessionId: Id, type: SessionEventType, payload: unknown): SessionEvent => ({
  id: nextEphemeralId++,
  sessionId,
  sequence: nextSeq(sessionId),
  type,
  payload,
  createdAt: Date.now(),
})

export const registerSessionRoutes = (
  app: Hono<AppEnv>,
  store: Store,
  bus: EventBus,
  workerLiveness: LivenessTracker,
  sessionLiveness: LivenessTracker,
  busyTracker: BusyTracker,
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
    const view = await sessionWithView(reg, store, workerLiveness, sessionLiveness, busyTracker)
    return c.json({ ...view, apiToken: reg.apiToken }, 201)
  })

  app.get('/sessions/:id', async c => {
    const s = await store.sessions.get(intParam(c.req.param('id')))
    if (!s) return c.json({ error: 'not found' }, 404)
    return c.json(await sessionWithView(s, store, workerLiveness, sessionLiveness, busyTracker))
  })

  // Session-private (bearer). Daemon pings this every 30s alongside the
  // worker-level /workers/heartbeat. Server uses it to distinguish 'machine
  // online' from 'this specific session has a live daemon attached'.
  app.post('/sessions/me/heartbeat', auth, async c => {
    const session = c.get('session')
    sessionLiveness.ping(String(session.id))
    return c.json({ attached: true })
  })

  // Session DELETE (no auth, v0). Drops the row. Browser-side events for this
  // session keep living in IndexedDB until the user clears them — by design,
  // since the local store is the user's own data, not ours to wipe.
  app.delete('/sessions/:id', async c => {
    const id = intParam(c.req.param('id'))
    const s = await store.sessions.get(id)
    if (!s) return c.json({ error: 'not found' }, 404)
    await store.sessions.destroy(id)
    sessionLiveness.forget(String(id))
    busyTracker.forget(id)
    sessionSeq.delete(id)
    return c.body(null, 204)
  })

  // Daemon-emitted events (bearer). Server doesn't persist; it synthesizes
  // an ephemeral envelope and publishes to the bus so subscribed browsers /
  // CLIs receive it live. turn_start / turn_complete / turn_error also toggle
  // busyTracker — the source of truth for the UI busy pulse now that there's
  // no DB timeline to derive from.
  app.post('/sessions/me/events', auth, async c => {
    const session = c.get('session')
    const body = (await c.req.json()) as { type?: SessionEventType; payload?: unknown }
    if (!body.type) return c.json({ error: 'type required' }, 400)
    if (body.type === 'turn_start') busyTracker.set(session.id, true)
    else if (body.type === 'turn_complete' || body.type === 'turn_error')
      busyTracker.set(session.id, false)
    const ev = synthesize(session.id, body.type, body.payload ?? null)
    bus.publish(session.id, ev)
    return c.json(ev, 201)
  })

  // Chat ingress (UI / CLI, no auth in v0). Synthesizes a user_message event
  // and publishes; the subscribed daemon (via SSE) picks it up and runs a
  // turn. Not persisted server-side — the browser writes incoming events to
  // its own IndexedDB for replay.
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
    if (images.some(i => i.length > MAX_IMAGE_DATA_URL))
      return c.json({ error: 'image too large (max ~8MB)' }, 413)
    const payload = images.length > 0 ? { text, images } : { text }
    const ev = synthesize(sessionId, 'user_message', payload)
    bus.publish(sessionId, ev)
    return c.json(ev, 201)
  })

  // Live tail. No history replay — events aren't persisted server-side. A
  // browser that wants context replays from its own IndexedDB before
  // connecting; this stream is purely 'what arrives from now on'.
  app.get('/sessions/:id/stream', async c => {
    const id = intParam(c.req.param('id'))
    const exists = await store.sessions.get(id)
    if (!exists) return c.json({ error: 'not found' }, 404)
    const signal = c.req.raw.signal
    return streamSSE(c, async stream => {
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
