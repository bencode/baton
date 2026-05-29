import type {
  Id,
  RequirementStatus,
  ResourceRef,
  Session,
  SessionEvent,
  SessionEventType,
  SessionMode,
  TaskStatus,
  Worker,
} from '@baton/shared'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { createEventBus, type EventBus } from './event-bus.ts'
import { createLiveness, type LivenessTracker } from './liveness.ts'
import { type AuthVars, bearerAuth } from './middleware/auth.ts'
import type { RequirementPatch, Store, TaskPatch } from './store/types.ts'

// Parse an `:id` URL param to int; NaN is fine — downstream finds return null → 404.
const intParam = (s: string): Id => Number(s)

export type AppEnv = { Variables: AuthVars }

// Merge a Session record with derived runtime view (alive, busy) for read endpoints.
const sessionWithView = async (
  session: Session,
  store: Store,
  liveness: LivenessTracker,
): Promise<Session & { alive: boolean; busy: boolean }> => ({
  ...session,
  alive: session.machineId ? liveness.isAlive(session.machineId) : false,
  busy: await store.sessions.isBusy(session.id),
})

const workerWithView = (
  worker: Worker,
  liveness: LivenessTracker,
): Worker & { alive: boolean } => ({
  ...worker,
  alive: liveness.isAlive(worker.machineId),
})

// HTTP surface. Layout:
//   - Workspace / Project / Requirement / Task: thin CRUD over Store (M1).
//   - Worker: unauth register + heartbeat + close (machineId is the anchor).
//   - Session: register + close (bearer for /sessions/me/*).
//   - Chat protocol (M2.5):
//       upward  ← POST /sessions/:id/messages   (UI / CLI, no auth)
//               ← POST /sessions/me/events       (worker, bearer)
//       downward → GET  /sessions/:id/stream     (SSE: replay + tail)
export const createApp = (
  store: Store,
  bus: EventBus = createEventBus(),
  liveness: LivenessTracker = createLiveness(),
): Hono<AppEnv> => {
  const app = new Hono<AppEnv>()
  const auth = bearerAuth(store)

  app.get('/health', c => c.json({ ok: true }))

  app.post('/workspaces', async c => {
    const body = (await c.req.json()) as { name?: string }
    if (!body.name) return c.json({ error: 'name required' }, 400)
    return c.json(await store.workspaces.create({ name: body.name }), 201)
  })
  app.get('/workspaces', async c => c.json(await store.workspaces.list()))
  app.get('/workspaces/:id', async c => {
    const w = await store.workspaces.get(intParam(c.req.param('id')))
    return w ? c.json(w) : c.json({ error: 'not found' }, 404)
  })
  app.get('/workspaces/:id/projects', async c =>
    c.json(await store.projects.listByWorkspace(intParam(c.req.param('id')))),
  )
  app.delete('/workspaces/:id', async c => {
    const id = intParam(c.req.param('id'))
    if (!(await store.workspaces.get(id))) return c.json({ error: 'not found' }, 404)
    await store.workspaces.delete(id)
    return c.body(null, 204)
  })

  app.post('/projects', async c => {
    const body = (await c.req.json()) as {
      workspaceId?: Id
      name?: string
      description?: string
    }
    if (!body.workspaceId || !body.name)
      return c.json({ error: 'workspaceId and name required' }, 400)
    const { workspaceId, name, description } = body
    return c.json(await store.projects.create({ workspaceId, name, description }), 201)
  })
  app.get('/projects/:id', async c => {
    const p = await store.projects.get(intParam(c.req.param('id')))
    return p ? c.json(p) : c.json({ error: 'not found' }, 404)
  })
  app.get('/projects/:id/requirements', async c =>
    c.json(await store.requirements.listByProject(intParam(c.req.param('id')))),
  )
  app.get('/projects/:id/sessions', async c => {
    const id = intParam(c.req.param('id'))
    const list = await store.sessions.listByProject(id)
    const merged = await Promise.all(list.map(s => sessionWithView(s, store, liveness)))
    return c.json(merged)
  })
  app.get('/projects/:id/workers', async c => {
    const id = intParam(c.req.param('id'))
    const list = await store.workers.listByProject(id)
    return c.json(list.map(w => workerWithView(w, liveness)))
  })
  // Resolve an item by its project-scoped code (R-N / T-N only). Sessions and
  // workers don't carry human codes — navigate to them by int id.
  app.get('/projects/:projectId/items/:code', async c => {
    const projectId = intParam(c.req.param('projectId'))
    const code = c.req.param('code')
    if (code.startsWith('R-')) {
      const r = await store.requirements.getByCode(projectId, code)
      return r ? c.json({ kind: 'requirement', item: r }) : c.json({ error: 'not found' }, 404)
    }
    if (code.startsWith('T-')) {
      const t = await store.tasks.getByCode(projectId, code)
      return t ? c.json({ kind: 'task', item: t }) : c.json({ error: 'not found' }, 404)
    }
    return c.json({ error: 'unknown code prefix' }, 400)
  })
  app.delete('/projects/:id', async c => {
    const id = intParam(c.req.param('id'))
    if (!(await store.projects.get(id))) return c.json({ error: 'not found' }, 404)
    await store.projects.delete(id)
    return c.body(null, 204)
  })

  app.post('/requirements', async c => {
    const body = (await c.req.json()) as {
      projectId?: Id
      title?: string
      description?: string
      resources?: ResourceRef[]
      tags?: string[]
      status?: RequirementStatus
    }
    if (!body.projectId || !body.title)
      return c.json({ error: 'projectId and title required' }, 400)
    const { projectId, title, description, resources, tags, status } = body
    return c.json(
      await store.requirements.create({ projectId, title, description, resources, tags, status }),
      201,
    )
  })
  app.get('/requirements/:id', async c => {
    const r = await store.requirements.get(intParam(c.req.param('id')))
    return r ? c.json(r) : c.json({ error: 'not found' }, 404)
  })
  app.get('/requirements/:id/full', async c => {
    const full = await store.getRequirementWithTasks(intParam(c.req.param('id')))
    return full ? c.json(full) : c.json({ error: 'not found' }, 404)
  })
  app.get('/requirements/:id/tasks', async c =>
    c.json(await store.tasks.listByRequirement(intParam(c.req.param('id')))),
  )
  app.patch('/requirements/:id', async c => {
    const id = intParam(c.req.param('id'))
    if (!(await store.requirements.get(id))) return c.json({ error: 'not found' }, 404)
    return c.json(await store.requirements.update(id, (await c.req.json()) as RequirementPatch))
  })
  app.delete('/requirements/:id', async c => {
    const id = intParam(c.req.param('id'))
    if (!(await store.requirements.get(id))) return c.json({ error: 'not found' }, 404)
    await store.requirements.delete(id)
    return c.body(null, 204)
  })

  app.post('/tasks', async c => {
    const body = (await c.req.json()) as {
      requirementId?: Id
      title?: string
      spec?: string
      dependsOn?: Id[]
      status?: TaskStatus
    }
    if (!body.requirementId || !body.title)
      return c.json({ error: 'requirementId and title required' }, 400)
    const { requirementId, title, spec, dependsOn, status } = body
    return c.json(await store.tasks.create({ requirementId, title, spec, dependsOn, status }), 201)
  })
  app.get('/tasks/:id', async c => {
    const t = await store.tasks.get(intParam(c.req.param('id')))
    return t ? c.json(t) : c.json({ error: 'not found' }, 404)
  })
  app.patch('/tasks/:id', async c => {
    const id = intParam(c.req.param('id'))
    if (!(await store.tasks.get(id))) return c.json({ error: 'not found' }, 404)
    return c.json(await store.tasks.update(id, (await c.req.json()) as TaskPatch))
  })
  app.delete('/tasks/:id', async c => {
    const id = intParam(c.req.param('id'))
    if (!(await store.tasks.get(id))) return c.json({ error: 'not found' }, 404)
    await store.tasks.delete(id)
    return c.body(null, 204)
  })

  // === M2.6: workers ===

  // Idempotent register (machineId-anchored). See store.workers.register
  // for the rule 1 / 2a / 2b / 2c algorithm.
  app.post('/workers', async c => {
    const body = (await c.req.json()) as {
      projectId?: Id
      machineId?: string
      name?: string
      hostname?: string
    }
    if (!body.projectId || !body.machineId || !body.name || !body.hostname)
      return c.json({ error: 'projectId, machineId, name, hostname required' }, 400)
    const out = await store.workers.register({
      projectId: body.projectId,
      machineId: body.machineId,
      name: body.name,
      hostname: body.hostname,
    })
    if (out.kind === 'name-collision') {
      return c.json(
        {
          error: `name "${body.name}" already in use by a different machine in this project`,
          hint: 'use --name to choose a different display name',
          existing: {
            id: out.existing.id,
            name: out.existing.name,
            hostname: out.existing.hostname,
          },
        },
        409,
      )
    }
    // First ping seeds liveness so the worker shows alive immediately.
    liveness.ping(out.worker.machineId)
    return c.json({ worker: workerWithView(out.worker, liveness), outcome: out.kind }, 201)
  })

  app.get('/workers/:id', async c => {
    const id = intParam(c.req.param('id'))
    const w = await store.workers.get(id)
    return w ? c.json(workerWithView(w, liveness)) : c.json({ error: 'not found' }, 404)
  })

  // Heartbeat is unauth in v0: the caller asserts a machineId. Single-tenant
  // dev environment; M3 adds auth when multi-tenant SaaS lands.
  app.post('/workers/heartbeat', async c => {
    const body = (await c.req.json()) as { machineId?: string }
    if (!body.machineId) return c.json({ error: 'machineId required' }, 400)
    liveness.ping(body.machineId)
    return c.json({ alive: true })
  })

  app.post('/workers/:id/close', async c => {
    const id = intParam(c.req.param('id'))
    const w = await store.workers.get(id)
    if (!w) return c.json({ error: 'not found' }, 404)
    await store.workers.close(id)
    liveness.forget(w.machineId)
    return c.body(null, 204)
  })

  // === M2.5: sessions + chat ===

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

  return app
}
