import type { Id } from '@baton/shared'
import type { Hono } from 'hono'
import type { CommandBus } from '../command-bus.ts'
import type { LivenessTracker } from '../liveness.ts'
import { workerBearerAuth } from '../middleware/auth.ts'
import type { ProjectBus } from '../project-bus.ts'
import type { SessionRuntime } from '../session-runtime.ts'
import { streamBus } from '../sse.ts'
import type { Store } from '../store/types.ts'
import { type AppEnv, intParam, workerWithView } from '../views.ts'

export const registerWorkerRoutes = (
  app: Hono<AppEnv>,
  store: Store,
  liveness: LivenessTracker,
  commands: CommandBus,
  runtime: SessionRuntime,
  projects: ProjectBus,
): void => {
  const auth = workerBearerAuth(store)
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
    projects.publish(out.worker.projectId, { resource: 'workers' })
    // apiToken returned on every successful (re)register so the daemon can
    // re-read it after losing local state.
    return c.json(
      { worker: workerWithView(out.worker, liveness), apiToken: out.apiToken, outcome: out.kind },
      201,
    )
  })

  // Worker command stream (worker-bearer). The persistent worker daemon
  // subscribes here and receives session.start / session.stop / session.delete
  // commands. Live-only — no replay. On disconnect, all of this worker's
  // sessions flip inactive immediately (its child processes died with it).
  app.get('/workers/me/stream', auth, c => {
    const worker = c.get('worker')
    // Daemon online: presence changed → refetch workers.
    projects.publish(worker.projectId, { resource: 'workers' })
    return streamBus(
      c,
      push => commands.subscribe(worker.id, push),
      () => {
        // Daemon offline: its sessions flip inactive (forgetWorker) and its
        // presence drops — refetch both.
        runtime.forgetWorker(worker.id)
        projects.publish(worker.projectId, { resource: 'workers' })
        projects.publish(worker.projectId, { resource: 'sessions' })
      },
    )
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
    projects.publish(w.projectId, { resource: 'workers' })
    projects.publish(w.projectId, { resource: 'sessions' })
    return c.body(null, 204)
  })
}
