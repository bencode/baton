import type { Id } from '@baton/shared'
import type { Hono } from 'hono'
import type { LivenessTracker } from '../liveness.ts'
import type { Store } from '../store/types.ts'
import { type AppEnv, intParam, workerWithView } from '../views.ts'

export const registerWorkerRoutes = (
  app: Hono<AppEnv>,
  store: Store,
  liveness: LivenessTracker,
): void => {
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

  // DELETE worker. Cascades to Session + SessionEvent (FK Cascade). The CLI
  // gates this behind --confirm; the server just executes.
  app.delete('/workers/:id', async c => {
    const id = intParam(c.req.param('id'))
    const w = await store.workers.get(id)
    if (!w) return c.json({ error: 'not found' }, 404)
    await store.workers.destroy(id)
    liveness.forget(w.machineId)
    return c.body(null, 204)
  })
}
