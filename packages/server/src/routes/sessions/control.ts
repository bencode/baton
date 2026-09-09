import { parseEffort } from '@baton/shared'
import { loadScopedSession } from '../../middleware/domain-scope.ts'
import { intParam } from '../../views.ts'
import type { RegisterSessionGroup } from './helpers.ts'
import { controlExecution } from './turns.ts'

// Runtime control + per-session settings: child up/down status, context clear,
// plan-mode and model toggles, interrupt, and the auto-title trigger.
export const registerSessionControl: RegisterSessionGroup = (app, ctx) => {
  const {
    store,
    bus,
    runtime,
    busyTracker,
    commands,
    terminal,
    auth,
    toView,
    bump,
    publishTitle,
    ownedByWorker,
  } = ctx

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

  // Stop any current attempt before resetting the provider conversation.
  // Pending input, worktree and paused state are preserved.
  app.post('/sessions/:id/clear', async c => {
    const s = await loadScopedSession(c, store, intParam(c.req.param('id')))
    if (s instanceof Response) return s
    // An open terminal is mid-conversation on this agentSessionId; regenerating it
    // here would orphan the live agent. Make the user close the terminal first.
    if (terminal.isOpen(s.id))
      return c.json({ error: 'terminal open — close it before clearing' }, 409)
    const execution = await controlExecution(ctx, s, 'context_clear')
    const updated = await store.sessions.get(s.id)
    return c.json(await toView(updated ?? s), execution.contextResetRequested ? 202 : 200)
  })

  // Toggle the session-wide read-only plan mode (web /plan or Shift+Tab). The
  // flag is persisted on the session, so it survives reloads and syncs across
  // clients; the worker never reads it directly — the server stamps each
  // PendingInput with the session's planMode, and the runner runs that
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

  // Set the session's model + effort override (web /model <name> [effort]; bare
  // /model resets both). Same shape as /mode: persisted on the session, stamped
  // onto each PendingInput, and the runner hands them to the SDK.
  //
  // The two args are validated asymmetrically, on purpose. The model name passes
  // through verbatim — no whitelist (gateway model ids vary); a bad name surfaces
  // as a turn_error in the transcript. Effort is a closed enum, so a typo IS
  // knowable here: reject it rather than let it be silently dropped downstream.
  app.post('/sessions/:id/model', async c => {
    const s = await loadScopedSession(c, store, intParam(c.req.param('id')))
    if (s instanceof Response) return s
    const body = (await c.req.json().catch(() => ({}))) as { model?: unknown; effort?: unknown }
    const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : null
    const rawEffort =
      typeof body.effort === 'string' && body.effort.trim() ? body.effort.trim() : null
    const effort = rawEffort === null ? null : parseEffort(rawEffort)
    if (rawEffort !== null && effort === null)
      return c.json({ error: `unknown effort: ${rawEffort}` }, 400)
    const updated = await store.sessions.setModel(s.id, model, effort)
    const ev = await store.sessions.appendEvent(s.id, 'system', { action: 'model', model, effort })
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
    await controlExecution(ctx, s, 'interrupt')
    return c.json(await toView(s))
  })

  // Explicit auto-title retry for older clients/manual callers. Normal turns now
  // trigger this from event ingress, so naming no longer depends on an open tab.
  app.post('/sessions/:id/autotitle', async c => {
    const s = await loadScopedSession(c, store, intParam(c.req.param('id')))
    if (s instanceof Response) return s
    publishTitle(s)
    return c.json(await toView(s))
  })

  // Open / close an interactive terminal for a hands-on, human-in-the-loop turn
  // alongside the headless relay (UI/CLI, no auth in v0). open tells the worker to
  // resume the agent session in a pty + dial back its terminal WS — the terminal
  // becomes `terminalOpen` once that WS attaches (the bridge), surfaced over the
  // 'sessions' project signal; the browser then connects its xterm WS. Only an idle
  // session can open one (an active headless child would fight the pty over the
  // same agentSessionId/JSONL — the worker also guards onStart). close drives the
  // server to drop the worker's WS, which tears down the pty.
  app.post('/sessions/:id/terminal', async c => {
    const s = await loadScopedSession(c, store, intParam(c.req.param('id')))
    if (s instanceof Response) return s
    const body = (await c.req.json().catch(() => ({}))) as { action?: 'open' | 'close' }
    if (body.action === 'close') {
      terminal.closeWorker(s.id) // drop the worker pty WS → worker kills the pty
      bump(s.projectId)
      return c.json(await toView(s))
    }
    if ((await store.turns.state(s.id)).turn)
      return c.json(
        { error: 'execution unfinished — wait for it to stop before opening a terminal' },
        409,
      )
    if (runtime.isActive(s.id))
      return c.json({ error: 'session active — stop it to open a terminal' }, 409)
    if (!commands.has(s.workerId))
      return c.json({ error: "worker offline — can't open a terminal" }, 409)
    if (
      !s.agentSessionId ||
      !s.worktreePath ||
      (s.agentKind === 'codex' && s.agentSessionId.startsWith('pending:'))
    )
      return c.json({ error: 'session not materialized — resume it once first' }, 409)
    commands.publish(s.workerId, {
      cmd: 'session.terminal',
      sessionId: s.id,
      action: 'open',
      agentSessionId: s.agentSessionId,
      worktreePath: s.worktreePath,
    })
    return c.json(await toView(s))
  })
}
