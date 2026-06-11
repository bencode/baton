import { randomUUID } from 'node:crypto'
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
import type { ProjectBus } from '../project-bus.ts'
import type { SessionRuntime } from '../session-runtime.ts'
import { streamBus } from '../sse.ts'
import type { Store } from '../store/types.ts'
import { type AppEnv, intParam, sessionWithView } from '../views.ts'

// ~8MB base64 ≈ ~6MB raw image; enough for screenshots, bounded for the SSE
// stream. We don't persist them anymore (browser does), but a runaway paste
// still hurts everyone subscribed to the live stream.
const MAX_IMAGE_DATA_URL = 8_000_000

// Parse an optional finite numeric query param; undefined when absent/blank/NaN.
const numQuery = (v: string | undefined): number | undefined => {
  if (v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export const registerSessionRoutes = (
  app: Hono<AppEnv>,
  store: Store,
  bus: EventBus,
  workerLiveness: LivenessTracker,
  runtime: SessionRuntime,
  busyTracker: BusyTracker,
  attachments: AttachmentStore,
  commands: CommandBus,
  projects: ProjectBus,
): void => {
  const auth = workerBearerAuth(store)
  const toView = (s: Parameters<typeof sessionWithView>[0]) =>
    sessionWithView(s, store, workerLiveness, runtime, busyTracker)
  // Tell project subscribers the session list changed so they refetch it.
  const bump = (projectId: Id) => projects.publish(projectId, { resource: 'sessions' })

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
    if (!body.projectId || !body.workerId)
      return c.json({ error: 'projectId, workerId required' }, 400)
    const worker = await store.workers.get(body.workerId)
    if (!worker || worker.projectId !== body.projectId)
      return c.json({ error: 'worker not found in project' }, 404)
    const created = await store.sessions.create({
      projectId: body.projectId,
      workerId: body.workerId,
      mode: body.mode ?? 'worker',
      name: body.name ?? '',
      agentKind: body.agentKind ?? 'claude-code',
    })
    // No name given → a stable placeholder (`session-<id>`); the worker auto-titles
    // it after the first turn. The id is only known post-insert.
    const session = body.name
      ? created
      : ((await store.sessions.autoTitle(created.id, `session-${created.id}`)) ?? created)
    commands.publish(worker.id, { cmd: 'session.start', sessionId: session.id, name: session.name })
    bump(session.projectId)
    return c.json(await toView(session), 201)
  })

  app.get('/sessions/:id', async c => {
    const s = await store.sessions.get(intParam(c.req.param('id')))
    if (!s) return c.json({ error: 'not found' }, 404)
    return c.json(await toView(s))
  })

  // Worker-bearer PATCH: materialize (agentSessionId+worktreePath, at spawn) OR
  // rename (name, e.g. the auto-title after the first turn). Never both at once.
  app.patch('/sessions/:id', auth, async c => {
    const owned = await ownedByWorker(c)
    if ('error' in owned) return owned.error
    const body = (await c.req.json()) as {
      agentSessionId?: string
      worktreePath?: string
      name?: string
    }
    if (body.agentSessionId && body.worktreePath) {
      const updated = await store.sessions.materialize(owned.id, {
        agentSessionId: body.agentSessionId,
        worktreePath: body.worktreePath,
      })
      bump(owned.session.projectId)
      return c.json(await toView(updated))
    }
    // Worker auto-title: guarded, never clobbers a human-locked name.
    if (typeof body.name === 'string' && body.name.trim()) {
      const updated = await store.sessions.autoTitle(owned.id, body.name.trim())
      if (updated) bump(owned.session.projectId)
      return c.json(await toView(updated ?? owned.session))
    }
    return c.json({ error: 'agentSessionId+worktreePath, or name, required' }, 400)
  })

  // Worker reports its child up (true, on spawn) / down (false, on exit). This is
  // the source of `attached` — instant, no heartbeat window.
  app.post('/sessions/:id/status', auth, async c => {
    const owned = await ownedByWorker(c)
    if ('error' in owned) return owned.error
    const body = (await c.req.json()) as { active?: boolean }
    runtime.setActive(owned.id, owned.session.workerId, body.active === true)
    if (body.active !== true) busyTracker.forget(owned.id)
    bump(owned.session.projectId)
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

  // Clear context — reset the claude conversation while keeping the session row,
  // worktree, share url, and DingTalk binding. We give the session a fresh
  // agentSessionId (next turn finds no transcript → a brand-new `--session-id`
  // conversation; code in the worktree is kept), then restart the child so it
  // reads the new id (the runner caches it in memory). A 'system' event records
  // it in the transcript. Materialized sessions only — a fresh one has nothing
  // to clear.
  app.post('/sessions/:id/clear', async c => {
    const s = await store.sessions.get(intParam(c.req.param('id')))
    if (!s) return c.json({ error: 'not found' }, 404)
    let view = s
    if (s.agentSessionId && s.worktreePath) {
      view = await store.sessions.materialize(s.id, {
        agentSessionId: randomUUID(),
        worktreePath: s.worktreePath,
      })
      // Restart the running child so it picks up the new id — but only if it's
      // actually active. Clearing a stopped session just regenerates the id
      // (the next resume reads it); don't silently revive a deliberately-stopped
      // one. The stop→start restart shares the same (rare) status race as
      // stop→resume; a manual resume recovers if it ever lands wrong.
      if (runtime.isActive(s.id)) {
        commands.publish(s.workerId, { cmd: 'session.stop', sessionId: s.id })
        commands.publish(s.workerId, { cmd: 'session.start', sessionId: s.id, name: s.name })
      }
    }
    const ev = await store.sessions.appendEvent(s.id, 'system', { action: 'context_cleared' })
    bus.publish(s.id, ev)
    return c.json(await toView(view))
  })

  // Toggle the session-wide read-only plan mode (web /plan or Shift+Tab). The
  // flag is persisted on the session, so it survives reloads and syncs across
  // clients; the worker never reads it directly — the server stamps each
  // user_message with the session's planMode (below), and the runner runs that
  // turn with permissionMode:'plan'. Idempotent: the body carries the target
  // value. A 'system' event records the switch in the transcript; bump() so the
  // rail/detail refetch the new flag.
  app.post('/sessions/:id/mode', async c => {
    const s = await store.sessions.get(intParam(c.req.param('id')))
    if (!s) return c.json({ error: 'not found' }, 404)
    const body = (await c.req.json().catch(() => ({}))) as { planMode?: unknown }
    const planMode = body.planMode === true
    const updated = await store.sessions.setPlanMode(s.id, planMode)
    const ev = await store.sessions.appendEvent(s.id, 'system', { action: 'plan_mode', planMode })
    bus.publish(s.id, ev)
    bump(s.projectId)
    return c.json(await toView(updated))
  })

  // Interrupt the in-flight turn (web /abort, like Esc): emit an `interrupt`
  // the worker's session child catches to abort the current SDK query. Session,
  // worktree, transcript, and binding all stay — the next message resumes.
  app.post('/sessions/:id/abort', async c => {
    const s = await store.sessions.get(intParam(c.req.param('id')))
    if (!s) return c.json({ error: 'not found' }, 404)
    const ev = await store.sessions.appendEvent(s.id, 'system', { action: 'interrupt' })
    bus.publish(s.id, ev)
    return c.json(await toView(s))
  })

  // Auto-title trigger (UI, no auth in v0). Fired by the browser after the first
  // turn completes. We only forward a title command for a still-placeholder name
  // (cheap guard — the worker's PATCH is also guarded by nameLocked) and only
  // once the session is materialized (the worker needs the transcript). The
  // worker reads its own transcript for context and PATCHes a name back.
  app.post('/sessions/:id/autotitle', async c => {
    const s = await store.sessions.get(intParam(c.req.param('id')))
    if (!s) return c.json({ error: 'not found' }, 404)
    if (/^session-\d+$/.test(s.name) && s.agentSessionId && s.worktreePath)
      commands.publish(s.workerId, {
        cmd: 'session.title',
        sessionId: s.id,
        agentSessionId: s.agentSessionId,
        worktreePath: s.worktreePath,
      })
    return c.json(await toView(s))
  })

  // Human rename (UI / CLI, no auth in v0). Locks the name (nameLocked) so a
  // pending auto-title can't override the user's choice. No worker command —
  // the name is collaboration metadata; the running child doesn't care.
  app.post('/sessions/:id/rename', async c => {
    const s = await store.sessions.get(intParam(c.req.param('id')))
    if (!s) return c.json({ error: 'not found' }, 404)
    const body = (await c.req.json()) as { name?: string }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return c.json({ error: 'name required' }, 400)
    const updated = await store.sessions.rename(s.id, name)
    bump(s.projectId)
    return c.json(await toView(updated))
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
    await attachments.forgetSession(id)
    bump(s.projectId)
    return c.body(null, 204)
  })

  // Session child emits events (worker-bearer, must own session). Persisted to
  // the transcript then published to the bus so subscribed browsers / CLIs
  // receive it live AND a late/other client can replay it. turn_start /
  // turn_complete / turn_error also toggle busyTracker — the UI busy-pulse SoT.
  app.post('/sessions/:id/events', auth, async c => {
    const owned = await ownedByWorker(c)
    if ('error' in owned) return owned.error
    const body = (await c.req.json()) as { type?: SessionEventType; payload?: unknown }
    if (!body.type) return c.json({ error: 'type required' }, 400)
    // Busy toggles drive the rail's pulse dot — bump so subscribers refetch the
    // session list (sdk_event streams are skipped: far too frequent to signal).
    if (body.type === 'turn_start') {
      busyTracker.set(owned.id, true)
      bump(owned.session.projectId)
    } else if (body.type === 'turn_complete' || body.type === 'turn_error') {
      busyTracker.set(owned.id, false)
      bump(owned.session.projectId)
    }
    const ev = await store.sessions.appendEvent(owned.id, body.type, body.payload ?? null)
    bus.publish(owned.id, ev)
    return c.json(ev, 201)
  })

  // Chat ingress (UI / CLI, no auth in v0). Persists a user_message then
  // publishes it; the subscribed daemon (via SSE) picks it up and runs a turn,
  // and any client replays it from the transcript on (re)connect.
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
      // Stamp the turn with the session's current plan mode (toggled via /plan or
      // Shift+Tab). The runner reads payload.planMode → permissionMode:'plan'.
      ...(session.planMode ? { planMode: true } : {}),
    }
    const ev = await store.sessions.appendEvent(sessionId, 'user_message', payload)
    // Mark the session as just-active (drives the rail's "last active" time).
    await store.sessions.touch(sessionId).catch(() => {})
    bump(session.projectId)
    bus.publish(sessionId, ev)
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
    const exists = await store.sessions.get(id)
    if (!exists) return c.json({ error: 'not found' }, 404)
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
    const exists = await store.sessions.get(id)
    if (!exists) return c.json({ error: 'not found' }, 404)
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
