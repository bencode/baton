import type { Attachment, SessionEvent, SessionEventType } from '@baton/shared'
import { loadScopedSession } from '../../middleware/domain-scope.ts'
import { deliverMessage } from '../../session-send.ts'
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
  const { store, bus, runtime, busyTracker, terminal, auth, bump, ownedByWorker, commands, projects } =
    ctx

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
    // A terminal owns the session interactively — relay input would queue against
    // a headless start the worker skips (stranded). Reject so the user uses the
    // terminal (or closes it first).
    if (terminal.get(sessionId))
      return c.json({ error: 'terminal open — type in the terminal, or close it first' }, 409)
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
    // Persist + auto-resume via the shared core. delivered:false ⇒ the worker is
    // offline (nothing persisted): no one can serve it and the command stream has
    // no replay, so reject. The Loop scheduler reuses this same call but skips.
    const sent = await deliverMessage(
      session,
      { text, images, attachments: atts },
      { store, bus, commands, runtime, projects },
    )
    if (!sent.delivered) return c.json({ error: 'worker offline — resume unavailable' }, 409)
    return c.json(sent.event, 201)
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
