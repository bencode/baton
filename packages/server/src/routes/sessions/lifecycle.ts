import type { AgentKind, Id, SessionMode } from '@baton/shared'
import { assertProjectAccess, loadScopedSession } from '../../middleware/domain-scope.ts'
import { intParam } from '../../views.ts'
import type { RegisterSessionGroup } from './helpers.ts'

// Session lifecycle: create the collaboration row + spawn command, read it, the
// worker-bearer materialize / auto-title PATCH, resume / stop control, human
// rename, and DELETE (tear down child + worktree, then drop the row).
export const registerSessionLifecycle: RegisterSessionGroup = (app, ctx) => {
  const {
    store,
    commands,
    attachments,
    runtime,
    busyTracker,
    terminal,
    auth,
    toView,
    bump,
    ownedByWorker,
  } = ctx

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
    const denied = await assertProjectAccess(c, store, body.projectId)
    if (denied) return denied
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
    const s = await loadScopedSession(c, store, intParam(c.req.param('id')))
    if (s instanceof Response) return s
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

  // Resume (start) / stop a session — control ops. resume re-spawns the child for
  // an existing session; stop kills it but keeps the row + worktree (→ inactive).
  app.post('/sessions/:id/resume', async c => {
    const s = await loadScopedSession(c, store, intParam(c.req.param('id')))
    if (s instanceof Response) return s
    // A terminal owns the session interactively — the worker would skip the
    // headless start anyway; reject up front so the UI/CLI says why.
    if (terminal.get(s.id))
      return c.json({ error: 'terminal open — close it to resume the headless session' }, 409)
    commands.publish(s.workerId, { cmd: 'session.start', sessionId: s.id, name: s.name })
    return c.json(await toView(s))
  })
  app.post('/sessions/:id/stop', async c => {
    const s = await loadScopedSession(c, store, intParam(c.req.param('id')))
    if (s instanceof Response) return s
    commands.publish(s.workerId, { cmd: 'session.stop', sessionId: s.id })
    return c.json(await toView(s))
  })

  // Human rename (UI / CLI, no auth in v0). Locks the name (nameLocked) so a
  // pending auto-title can't override the user's choice. No worker command —
  // the name is collaboration metadata; the running child doesn't care.
  app.post('/sessions/:id/rename', async c => {
    const s = await loadScopedSession(c, store, intParam(c.req.param('id')))
    if (s instanceof Response) return s
    const body = (await c.req.json()) as { name?: string }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return c.json({ error: 'name required' }, 400)
    const updated = await store.sessions.rename(s.id, name)
    bump(s.projectId)
    return c.json(await toView(updated))
  })

  // Session DELETE (no auth, v0). Tell the owning worker to tear down its child +
  // worktree, then drop the row (its persisted transcript events go with it).
  app.delete('/sessions/:id', async c => {
    const id = intParam(c.req.param('id'))
    const s = await loadScopedSession(c, store, id)
    if (s instanceof Response) return s
    commands.publish(s.workerId, {
      cmd: 'session.delete',
      sessionId: id,
      worktreePath: s.worktreePath,
    })
    await store.sessions.destroy(id)
    runtime.forget(id)
    busyTracker.forget(id)
    await attachments.forget(String(id))
    bump(s.projectId)
    return c.body(null, 204)
  })
}
