import type {
  AssignmentEvent,
  AssignmentStatus,
  Id,
  RequirementStatus,
  ResourceRef,
  SessionMode,
  SessionStatus,
  TaskStatus,
} from '@baton/shared'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { createEventBus, type EventBus } from './event-bus.ts'
import { type AuthVars, bearerAuth, requireOwnership } from './middleware/auth.ts'
import type { RequirementPatch, Store, TaskPatch } from './store/types.ts'

// Parse an `:id` URL param to int; NaN is fine — downstream finds return null → 404.
const intParam = (s: string): Id => Number(s)

export type AppEnv = { Variables: AuthVars }

// HTTP surface: thin layer over Store + auth middleware + SSE assignment stream.
// Bus is internal so the same app fans events from POST → SSE subscribers.
export const createApp = (store: Store, bus: EventBus = createEventBus()): Hono<AppEnv> => {
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
  app.get('/projects/:id/sessions', async c =>
    c.json(await store.sessions.listByProject(intParam(c.req.param('id')))),
  )
  app.get('/projects/:id/assignments', async c => {
    const projectId = intParam(c.req.param('id'))
    const statusQ = c.req.query('status')
    const sessionIdQ = c.req.query('sessionId')
    const status = statusQ ? (statusQ.split(',') as AssignmentStatus[]) : undefined
    const sessionId = sessionIdQ ? Number(sessionIdQ) : undefined
    return c.json(await store.assignments.listByProject(projectId, { status, sessionId }))
  })
  // Resolve an item by its project-scoped code (R-N / T-N / S-N / A-N).
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
    if (code.startsWith('S-')) {
      const s = await store.sessions.getByCode(projectId, code)
      return s ? c.json({ kind: 'session', item: s }) : c.json({ error: 'not found' }, 404)
    }
    if (code.startsWith('A-')) {
      const a = await store.assignments.getByCode(projectId, code)
      return a ? c.json({ kind: 'assignment', item: a }) : c.json({ error: 'not found' }, 404)
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
      requires?: string[]
      dependsOn?: Id[]
      status?: TaskStatus
    }
    if (!body.requirementId || !body.title)
      return c.json({ error: 'requirementId and title required' }, 400)
    const { requirementId, title, spec, requires, dependsOn, status } = body
    return c.json(
      await store.tasks.create({ requirementId, title, spec, requires, dependsOn, status }),
      201,
    )
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

  // === M2: sessions + assignments ===

  // Session register: public, returns apiToken once.
  app.post('/sessions', async c => {
    const body = (await c.req.json()) as {
      projectId?: Id
      mode?: SessionMode
      name?: string
      capabilities?: string[]
    }
    if (!body.projectId || !body.name || !body.mode)
      return c.json({ error: 'projectId, name, mode required' }, 400)
    const { projectId, mode, name, capabilities } = body
    return c.json(await store.sessions.register({ projectId, mode, name, capabilities }), 201)
  })
  app.get('/sessions/:id', async c => {
    const s = await store.sessions.get(intParam(c.req.param('id')))
    return s ? c.json(s) : c.json({ error: 'not found' }, 404)
  })

  // Session-private (bearer): heartbeat, claim, close.
  app.post('/sessions/me/heartbeat', auth, async c => {
    const body = (await c.req.json().catch(() => ({}))) as { status?: SessionStatus }
    const session = c.get('session')
    return c.json(await store.sessions.heartbeat(session.id, body.status))
  })
  app.post('/sessions/me/claim', auth, async c => {
    const session = c.get('session')
    const result = await store.sessions.claim(session.id)
    if (!result) return c.body(null, 204)
    return c.json(result)
  })
  app.post('/sessions/me/close', auth, async c => {
    const session = c.get('session')
    await store.sessions.close(session.id)
    return c.body(null, 204)
  })

  app.get('/assignments/:id', async c => {
    const a = await store.assignments.get(intParam(c.req.param('id')))
    return a ? c.json(a) : c.json({ error: 'not found' }, 404)
  })
  app.get('/assignments/:id/events', async c =>
    c.json(await store.assignments.listEvents(intParam(c.req.param('id')))),
  )

  // Live tail (SSE): replay history then subscribe to bus.
  app.get('/assignments/:id/stream', async c => {
    const id = intParam(c.req.param('id'))
    const exists = await store.assignments.get(id)
    if (!exists) return c.json({ error: 'not found' }, 404)
    const signal = c.req.raw.signal
    return streamSSE(c, async stream => {
      const history = await store.assignments.listEvents(id)
      for (const e of history) {
        if (signal.aborted) return
        await stream.writeSSE({ data: JSON.stringify(e) })
      }
      let resolve = (): void => {}
      const pending: AssignmentEvent[] = []
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
        unsub()
        signal.removeEventListener('abort', wake)
      }
    })
  })

  // Assignment progress (bearer + ownership).
  app.post('/assignments/:id/events', auth, async c => {
    const id = intParam(c.req.param('id'))
    const owned = await requireOwnership(c, store, id)
    if (owned instanceof Response) return owned
    const body = (await c.req.json()) as { sequence?: number; payload?: unknown }
    if (typeof body.sequence !== 'number' || body.payload === undefined)
      return c.json({ error: 'sequence (number) and payload required' }, 400)
    const event = await store.assignments.appendEvent(id, body.sequence, body.payload)
    bus.publish(id, event)
    return c.json(event, 201)
  })
  app.post('/assignments/:id/complete', auth, async c => {
    const id = intParam(c.req.param('id'))
    const owned = await requireOwnership(c, store, id)
    if (owned instanceof Response) return owned
    const body = (await c.req.json()) as { status?: 'done' | 'failed'; result?: string }
    if (body.status !== 'done' && body.status !== 'failed')
      return c.json({ error: 'status must be done|failed' }, 400)
    return c.json(await store.assignments.complete(id, body.status, body.result))
  })
  app.post('/assignments/:id/abandon', auth, async c => {
    const id = intParam(c.req.param('id'))
    const owned = await requireOwnership(c, store, id)
    if (owned instanceof Response) return owned
    const body = (await c.req.json().catch(() => ({}))) as { reason?: string }
    return c.json(await store.assignments.abandon(id, body.reason))
  })

  return app
}
