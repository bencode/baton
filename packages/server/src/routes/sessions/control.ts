import { randomUUID } from 'node:crypto'
import { loadScopedSession } from '../../middleware/domain-scope.ts'
import { intParam } from '../../views.ts'
import type { RegisterSessionGroup } from './helpers.ts'

// Runtime control + per-session settings: child up/down status, context clear,
// plan-mode and model toggles, interrupt, and the auto-title trigger.
export const registerSessionControl: RegisterSessionGroup = (app, ctx) => {
  const { store, bus, runtime, busyTracker, commands, auth, toView, bump, ownedByWorker } = ctx

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

  // Clear context — reset the claude conversation while keeping the session row,
  // worktree, share url, and DingTalk binding. We give the session a fresh
  // agentSessionId (next turn finds no transcript → a brand-new `--session-id`
  // conversation; code in the worktree is kept), then restart the child so it
  // reads the new id (the runner caches it in memory). A 'system' event records
  // it in the transcript. Materialized sessions only — a fresh one has nothing
  // to clear.
  app.post('/sessions/:id/clear', async c => {
    const s = await loadScopedSession(c, store, intParam(c.req.param('id')))
    if (s instanceof Response) return s
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
    const s = await loadScopedSession(c, store, intParam(c.req.param('id')))
    if (s instanceof Response) return s
    const body = (await c.req.json().catch(() => ({}))) as { planMode?: unknown }
    const planMode = body.planMode === true
    const updated = await store.sessions.setPlanMode(s.id, planMode)
    const ev = await store.sessions.appendEvent(s.id, 'system', { action: 'plan_mode', planMode })
    bus.publish(s.id, ev)
    bump(s.projectId)
    return c.json(await toView(updated))
  })

  // Set the session's model override (web /model <name>; bare /model resets).
  // Same shape as /mode: persisted on the session, stamped onto each
  // user_message (below), and the runner passes it to the SDK's options.model.
  // The name is passed through verbatim — no whitelist (gateway model ids
  // vary); a bad name surfaces as a turn_error in the transcript.
  app.post('/sessions/:id/model', async c => {
    const s = await loadScopedSession(c, store, intParam(c.req.param('id')))
    if (s instanceof Response) return s
    const body = (await c.req.json().catch(() => ({}))) as { model?: unknown }
    const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : null
    const updated = await store.sessions.setModel(s.id, model)
    const ev = await store.sessions.appendEvent(s.id, 'system', { action: 'model', model })
    bus.publish(s.id, ev)
    bump(s.projectId)
    return c.json(await toView(updated))
  })

  // Interrupt the in-flight turn (web /abort, like Esc): emit an `interrupt`
  // the worker's session child catches to abort the current SDK query. Session,
  // worktree, transcript, and binding all stay — the next message resumes.
  app.post('/sessions/:id/abort', async c => {
    const s = await loadScopedSession(c, store, intParam(c.req.param('id')))
    if (s instanceof Response) return s
    const ev = await store.sessions.appendEvent(s.id, 'system', { action: 'interrupt' })
    bus.publish(s.id, ev)
    // Drive the authority too, not just the breadcrumb: a healthy runner aborts
    // its live turn and emits the close (fast path). But if the runner is wedged
    // or the session stream is dead, the interrupt event never reaches it — so
    // mark the open turn stale, and the next sweep tick (≤30s) synthesizes the
    // close. Either way the user's interrupt actually clears the "thinking" state.
    if (busyTracker.read(s.id)) {
      busyTracker.markStale(s.id)
      bump(s.projectId)
    }
    return c.json(await toView(s))
  })

  // Auto-title trigger (UI, no auth in v0). Fired by the browser after the first
  // turn completes. We only forward a title command for a still-placeholder name
  // (cheap guard — the worker's PATCH is also guarded by nameLocked) and only
  // once the session is materialized (the worker needs the transcript). The
  // worker reads its own transcript for context and PATCHes a name back.
  app.post('/sessions/:id/autotitle', async c => {
    const s = await loadScopedSession(c, store, intParam(c.req.param('id')))
    if (s instanceof Response) return s
    if (/^session-\d+$/.test(s.name) && s.agentSessionId && s.worktreePath)
      commands.publish(s.workerId, {
        cmd: 'session.title',
        sessionId: s.id,
        agentSessionId: s.agentSessionId,
        worktreePath: s.worktreePath,
      })
    return c.json(await toView(s))
  })
}
