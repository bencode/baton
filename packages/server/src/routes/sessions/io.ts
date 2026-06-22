import type { Attachment, SessionEvent, SessionEventType } from '@baton/shared'
import { loadScopedSession } from '../../middleware/domain-scope.ts'
import { streamBus } from '../../sse.ts'
import { intParam } from '../../views.ts'
import type { RegisterSessionGroup } from './helpers.ts'

// ~8MB base64 ≈ ~6MB raw image; enough for screenshots, bounded for the SSE
// stream and the persisted user_message payload. A runaway paste still hurts
// everyone subscribed to the live stream.
const MAX_IMAGE_DATA_URL = 8_000_000

// Parse an optional finite numeric query param; undefined when absent/blank/NaN.
const numQuery = (v: string | undefined): number | undefined => {
  if (v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

// Transcript I/O: the worker-bearer event ingress (which drives busy liveness),
// chat-message ingress, the bounded history read, and the live SSE stream.
export const registerSessionIo: RegisterSessionGroup = (app, ctx) => {
  const { store, bus, runtime, busyTracker, auth, bump, ownedByWorker, commands } = ctx

  // Session child emits events (worker-bearer, must own session). Persisted to
  // the transcript then published to the bus so subscribed browsers / CLIs
  // receive it live AND a late/other client can replay it. turn_start /
  // turn_complete / turn_error also toggle busyTracker — the UI busy-pulse SoT.
  app.post('/sessions/:id/events', auth, async c => {
    const owned = await ownedByWorker(c)
    if ('error' in owned) return owned.error
    const body = (await c.req.json()) as { type?: SessionEventType; payload?: unknown }
    if (!body.type) return c.json({ error: 'type required' }, 400)
    // turn_start opens a turn; turn_complete/turn_error close it — these drive the
    // rail's pulse dot, so bump subscribers to refetch the session list. Every
    // other event (sdk_event, turn_heartbeat) only refreshes turn liveness so a
    // long-but-alive turn keeps reading busy; no bump (far too frequent to signal).
    if (body.type === 'turn_start') {
      busyTracker.open(owned.id)
      bump(owned.session.projectId)
    } else if (body.type === 'turn_complete' || body.type === 'turn_error') {
      busyTracker.close(owned.id)
      bump(owned.session.projectId)
    } else {
      busyTracker.refresh(owned.id)
    }
    const ev = await store.sessions.appendEvent(owned.id, body.type, body.payload ?? null)
    bus.publish(owned.id, ev)
    return c.json(ev, 201)
  })

  // Chat ingress (UI / CLI, no auth in v0). Persists a user_message then
  // publishes it; the subscribed daemon picks it up live (SSE) and runs a turn.
  // The persisted row is the authoritative queue: if the daemon misses the live
  // event (reconnect gap, etc.) it drains it on its next (re)connect, and any
  // client replays it from the transcript on (re)connect.
  app.post('/sessions/:id/messages', async c => {
    const sessionId = intParam(c.req.param('id'))
    const session = await loadScopedSession(c, store, sessionId)
    if (session instanceof Response) return session
    // An active session has a live worker child subscribed to receive this live.
    // Inactive but the owning worker is CONNECTED → auto-resume: persist below,
    // then publish session.start so the worker spawns the runner, which reconciles
    // this message from the durable transcript. Only reject when the worker is
    // offline (genuinely no one to serve it, and the command stream has no replay).
    const active = runtime.isActive(sessionId)
    if (!active && !commands.has(session.workerId))
      return c.json({ error: 'worker offline — resume unavailable' }, 409)
    const body = (await c.req.json()) as {
      text?: string
      images?: unknown
      attachments?: unknown
    }
    const text = typeof body.text === 'string' ? body.text : ''
    const images = Array.isArray(body.images)
      ? body.images.filter((i): i is string => typeof i === 'string')
      : []
    const atts = Array.isArray(body.attachments) ? (body.attachments as Attachment[]) : []
    if (text.length === 0 && images.length === 0 && atts.length === 0)
      return c.json({ error: 'text, images, or attachments required' }, 400)
    if (images.some(i => i.length > MAX_IMAGE_DATA_URL))
      return c.json({ error: 'image too large (max ~8MB)' }, 413)
    const payload = {
      text,
      ...(images.length > 0 ? { images } : {}),
      ...(atts.length > 0 ? { attachments: atts } : {}),
      // Stamp the turn with the session's current plan mode (toggled via /plan or
      // Shift+Tab). The runner reads payload.planMode → permissionMode:'plan'.
      ...(session.planMode ? { planMode: true } : {}),
      // Same for the model override (/model): the runner reads payload.model →
      // SDK options.model. Unset = the CLI default model.
      ...(session.model ? { model: session.model } : {}),
    }
    const ev = await store.sessions.appendEvent(sessionId, 'user_message', payload)
    // Mark the session as just-active (drives the rail's "last active" time).
    await store.sessions.touch(sessionId).catch(() => {})
    bump(session.projectId)
    bus.publish(sessionId, ev)
    // Was inactive but the worker is connected → wake it. The runner spawns and
    // reconciles this just-persisted message from the transcript (the bus.publish
    // above only reached viewers; the runner isn't subscribed yet).
    if (!active)
      commands.publish(session.workerId, { cmd: 'session.start', sessionId, name: session.name })
    return c.json(ev, 201)
  })

  // Transcript history (persisted log) as a plain JSON list. The web loads a
  // bounded window on open instead of the whole transcript (long sessions reach
  // multiple MB). `?limit=<n>` returns the most recent n events; add `?before=<seq>`
  // to page older ones ("load earlier"). `?since=<seq>` (no limit) returns events
  // at/after a sequence — used by the SSE-reconnect/bridge backfill, kept as-is.
  // Gated like other reads.
  app.get('/sessions/:id/events', async c => {
    const id = intParam(c.req.param('id'))
    const exists = await loadScopedSession(c, store, id)
    if (exists instanceof Response) return exists
    const limit = numQuery(c.req.query('limit'))
    if (limit !== undefined) {
      const before = numQuery(c.req.query('before'))
      return c.json(await store.sessions.listEventWindow(id, { before, limit }))
    }
    const since = numQuery(c.req.query('since'))
    const all = await store.sessions.listEvents(id)
    return c.json(since !== undefined ? all.filter(e => e.sequence >= since) : all)
  })

  // Transcript stream: replays the persisted log then tails live. `?live=1` skips
  // the replay (the web now loads history via GET above and only tails live here;
  // the worker child also uses ?live=1 so a resume doesn't re-run past messages).
  // `?since=<seq>` bounds the replay to events at/after a sequence — the DingTalk
  // bridge passes its message's sequence so it doesn't re-read the whole history.
  app.get('/sessions/:id/stream', async c => {
    const id = intParam(c.req.param('id'))
    const exists = await loadScopedSession(c, store, id)
    if (exists instanceof Response) return exists
    const live = c.req.query('live') === '1'
    const since = Number(c.req.query('since'))
    const load = async (): Promise<SessionEvent[]> => {
      const all = await store.sessions.listEvents(id)
      return Number.isFinite(since) ? all.filter(e => e.sequence >= since) : all
    }
    return streamBus<SessionEvent>(c, push => bus.subscribe(id, push), {
      ...(live ? {} : { replay: { load, keyOf: e => e.id } }),
    })
  })
}
