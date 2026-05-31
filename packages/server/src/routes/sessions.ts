import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import type {
  AgentKind,
  Attachment,
  Id,
  SessionEvent,
  SessionEventType,
  SessionMode,
} from '@baton/shared'
import type { Context, Hono } from 'hono'
import type { AttachmentStore } from '../attachments.ts'
import type { BusyTracker } from '../busy.ts'
import type { CommandBus } from '../command-bus.ts'
import type { EventBus } from '../event-bus.ts'
import type { LivenessTracker } from '../liveness.ts'
import { workerBearerAuth } from '../middleware/auth.ts'
import type { SessionRuntime } from '../session-runtime.ts'
import { streamBus } from '../sse.ts'
import type { Store } from '../store/types.ts'
import { type AppEnv, intParam, sessionWithView } from '../views.ts'

// ~8MB base64 ≈ ~6MB raw image; enough for screenshots, bounded for the SSE
// stream. We don't persist them anymore (browser does), but a runaway paste
// still hurts everyone subscribed to the live stream.
const MAX_IMAGE_DATA_URL = 8_000_000

// RFC 5987 ext-value: encodeURIComponent leaves ' ( ) * literal, but those are
// not attr-chars, so a strict parser can mis-read them (the apostrophe is the
// field delimiter). Percent-encode them too.
const rfc5987 = (s: string): string =>
  encodeURIComponent(s).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

// HTTP header values are latin1 (ByteString) — a non-ASCII filename (e.g. a
// Chinese name) throws when set. ASCII-fold the legacy `filename=` fallback and
// carry the real UTF-8 name in RFC 5987 `filename*`.
const contentDisposition = (filename: string): string => {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'")
  return `inline; filename="${ascii}"; filename*=UTF-8''${rfc5987(filename)}`
}

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
  runtime: SessionRuntime,
  busyTracker: BusyTracker,
  attachments: AttachmentStore,
  commands: CommandBus,
): void => {
  const auth = workerBearerAuth(store)
  const toView = (s: Parameters<typeof sessionWithView>[0]) =>
    sessionWithView(s, store, workerLiveness, runtime, busyTracker)

  // Helper: load a session, 404 if missing, 403 if the bearer worker doesn't own
  // it. Used by every worker-authed session route.
  const ownedByWorker = async (c: Context<AppEnv>) => {
    const id = intParam(c.req.param('id') ?? '')
    const s = await store.sessions.get(id)
    if (!s) return { error: c.json({ error: 'not found' }, 404) }
    if (s.workerId !== c.get('worker').id) return { error: c.json({ error: 'forbidden' }, 403) }
    return { id, session: s }
  }

  // Create a session row (collaboration metadata only) and push a session.start
  // command to the owning worker, which materializes (worktree + agentSessionId)
  // and spawns the session child process. No agentSessionId/worktreePath here —
  // those are worker-assigned. Remote-friendly: the caller needs no local machine.
  app.post('/sessions', async c => {
    const body = (await c.req.json()) as {
      projectId?: Id
      workerId?: Id
      mode?: SessionMode
      name?: string
      agentKind?: AgentKind
    }
    if (!body.projectId || !body.workerId || !body.name)
      return c.json({ error: 'projectId, workerId, name required' }, 400)
    const worker = await store.workers.get(body.workerId)
    if (!worker || worker.projectId !== body.projectId)
      return c.json({ error: 'worker not found in project' }, 404)
    const session = await store.sessions.create({
      projectId: body.projectId,
      workerId: body.workerId,
      mode: body.mode ?? 'worker',
      name: body.name,
      agentKind: body.agentKind ?? 'claude-code',
    })
    commands.publish(worker.id, { cmd: 'session.start', sessionId: session.id, name: session.name })
    return c.json(await toView(session), 201)
  })

  app.get('/sessions/:id', async c => {
    const s = await store.sessions.get(intParam(c.req.param('id')))
    if (!s) return c.json({ error: 'not found' }, 404)
    return c.json(await toView(s))
  })

  // Worker fills in the agent session id + worktree it materialized (worker-bearer).
  app.patch('/sessions/:id', auth, async c => {
    const owned = await ownedByWorker(c)
    if ('error' in owned) return owned.error
    const body = (await c.req.json()) as { agentSessionId?: string; worktreePath?: string }
    if (!body.agentSessionId || !body.worktreePath)
      return c.json({ error: 'agentSessionId, worktreePath required' }, 400)
    const updated = await store.sessions.materialize(owned.id, {
      agentSessionId: body.agentSessionId,
      worktreePath: body.worktreePath,
    })
    return c.json(await toView(updated))
  })

  // Worker reports its child up (true, on spawn) / down (false, on exit). This is
  // the source of `attached` — instant, no heartbeat window.
  app.post('/sessions/:id/status', auth, async c => {
    const owned = await ownedByWorker(c)
    if ('error' in owned) return owned.error
    const body = (await c.req.json()) as { active?: boolean }
    runtime.setActive(owned.id, owned.session.workerId, body.active === true)
    if (body.active !== true) busyTracker.forget(owned.id)
    return c.json(await toView(owned.session))
  })

  // Resume (start) / stop a session — control ops. resume re-spawns the child for
  // an existing session; stop kills it but keeps the row + worktree (→ inactive).
  app.post('/sessions/:id/resume', async c => {
    const s = await store.sessions.get(intParam(c.req.param('id')))
    if (!s) return c.json({ error: 'not found' }, 404)
    commands.publish(s.workerId, { cmd: 'session.start', sessionId: s.id, name: s.name })
    return c.json(await toView(s))
  })
  app.post('/sessions/:id/stop', async c => {
    const s = await store.sessions.get(intParam(c.req.param('id')))
    if (!s) return c.json({ error: 'not found' }, 404)
    commands.publish(s.workerId, { cmd: 'session.stop', sessionId: s.id })
    return c.json(await toView(s))
  })

  // Session DELETE (no auth, v0). Tell the owning worker to tear down its child +
  // worktree, then drop the row. Browser-side events live in IndexedDB.
  app.delete('/sessions/:id', async c => {
    const id = intParam(c.req.param('id'))
    const s = await store.sessions.get(id)
    if (!s) return c.json({ error: 'not found' }, 404)
    commands.publish(s.workerId, {
      cmd: 'session.delete',
      sessionId: id,
      worktreePath: s.worktreePath,
    })
    await store.sessions.destroy(id)
    runtime.forget(id)
    busyTracker.forget(id)
    sessionSeq.delete(id)
    await attachments.forgetSession(id)
    return c.body(null, 204)
  })

  // Session child emits events (worker-bearer, must own session). Server doesn't
  // persist; it synthesizes an ephemeral envelope and publishes to the bus so
  // subscribed browsers / CLIs receive it live. turn_start / turn_complete /
  // turn_error also toggle busyTracker — the UI busy-pulse source of truth.
  app.post('/sessions/:id/events', auth, async c => {
    const owned = await ownedByWorker(c)
    if ('error' in owned) return owned.error
    const body = (await c.req.json()) as { type?: SessionEventType; payload?: unknown }
    if (!body.type) return c.json({ error: 'type required' }, 400)
    if (body.type === 'turn_start') busyTracker.set(owned.id, true)
    else if (body.type === 'turn_complete' || body.type === 'turn_error')
      busyTracker.set(owned.id, false)
    const ev = synthesize(owned.id, body.type, body.payload ?? null)
    bus.publish(owned.id, ev)
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
    // Messages only go to an active session (a live worker child is subscribed).
    // Otherwise there's no one to receive it — reject rather than drop silently.
    if (!runtime.isActive(sessionId))
      return c.json({ error: 'session not active — resume it first' }, 409)
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
    }
    const ev = synthesize(sessionId, 'user_message', payload)
    bus.publish(sessionId, ev)
    return c.json(ev, 201)
  })

  // Upload a chat attachment (no auth in v0, like /messages). The raw request
  // body IS the file — streamed straight to disk, no multipart parse, no size
  // cap (the Agent decides what it can handle). filename rides a query param,
  // the file's media type rides content-type. Returns the Attachment descriptor.
  app.post('/sessions/:id/attachments', async c => {
    const sessionId = intParam(c.req.param('id'))
    const session = await store.sessions.get(sessionId)
    if (!session) return c.json({ error: 'not found' }, 404)
    const meta = await attachments.put(sessionId, {
      filename: c.req.query('filename') || 'file',
      contentType: c.req.header('content-type') || 'application/octet-stream',
      body: c.req.raw.body,
    })
    return c.json(meta, 201)
  })

  // Download a stored attachment (no auth in v0). Streamed from disk so large
  // files don't get buffered. Used by the Worker to fetch files into its
  // worktree, and later by the web UI for preview.
  app.get('/sessions/:id/attachments/:attId', async c => {
    const sessionId = intParam(c.req.param('id'))
    const found = await attachments.get(sessionId, c.req.param('attId'))
    if (!found) return c.json({ error: 'not found' }, 404)
    c.header('content-type', found.meta.contentType)
    c.header('content-length', String(found.meta.size))
    c.header('content-disposition', contentDisposition(found.meta.filename))
    const web = Readable.toWeb(createReadStream(found.path)) as ReadableStream<Uint8Array>
    return c.body(web)
  })

  // Live tail. No history replay — events aren't persisted server-side. A
  // browser that wants context replays from its own IndexedDB before
  // connecting; this stream is purely 'what arrives from now on'.
  app.get('/sessions/:id/stream', async c => {
    const id = intParam(c.req.param('id'))
    const exists = await store.sessions.get(id)
    if (!exists) return c.json({ error: 'not found' }, 404)
    return streamBus(c, push => bus.subscribe(id, push))
  })
}
