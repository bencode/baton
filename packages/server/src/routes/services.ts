import { randomUUID } from 'node:crypto'
import { type Id, isServiceName, type ServiceReport, type ServiceRunInput } from '@baton/shared'
import type { Hono } from 'hono'
import type { CommandBus } from '../command-bus.ts'
import { workerBearerAuth } from '../middleware/auth.ts'
import { assertProjectAccess } from '../middleware/domain-scope.ts'
import type { ServiceRuntime } from '../service-runtime.ts'
import type { Store } from '../store/types.ts'
import { type AppEnv, intParam } from '../views.ts'

const ownsTargetWorker = (callerWorkerId: Id | undefined, targetWorkerId: Id): boolean =>
  callerWorkerId === undefined || callerWorkerId === targetWorkerId

export const registerServiceRoutes = (
  app: Hono<AppEnv>,
  store: Store,
  commands: CommandBus,
  runtime: ServiceRuntime,
): void => {
  app.get('/projects/:projectId/services', async c => {
    const projectId = intParam(c.req.param('projectId'))
    const callerWorkerId = c.get('workerId')
    if (callerWorkerId !== undefined) {
      const caller = await store.workers.get(callerWorkerId)
      if (!caller || caller.projectId !== projectId) return c.json({ error: 'not found' }, 404)
    }
    const denied = await assertProjectAccess(c, store, projectId)
    if (denied) return denied
    const workers = await store.workers.listByProject(projectId)
    return c.json(runtime.listWorkers(workers.map(worker => worker.id)))
  })

  app.post('/workers/:workerId/services', async c => {
    const workerId = intParam(c.req.param('workerId'))
    const worker = await store.workers.get(workerId)
    if (!worker) return c.json({ error: 'worker not found' }, 404)
    const denied = await assertProjectAccess(c, store, worker.projectId)
    if (denied) return denied
    if (!ownsTargetWorker(c.get('workerId'), workerId))
      return c.json({ error: 'a worker may only manage its own services' }, 403)
    if (!commands.has(workerId)) return c.json({ error: 'worker is offline' }, 409)

    const body = (await c.req.json()) as Partial<ServiceRunInput>
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const argv = Array.isArray(body.argv)
      ? body.argv.filter((arg): arg is string => typeof arg === 'string')
      : []
    if (
      typeof body.sessionId !== 'number' ||
      !Number.isInteger(body.sessionId) ||
      body.sessionId <= 0 ||
      !isServiceName(name) ||
      argv.length === 0 ||
      argv.some(arg => arg.length === 0) ||
      argv.length !== body.argv?.length
    )
      return c.json({ error: 'sessionId, valid name, and non-empty argv required' }, 400)
    if (runtime.listWorker(workerId).some(service => service.name === name))
      return c.json({ error: `service "${name}" is already running` }, 409)
    const session = await store.sessions.get(body.sessionId)
    if (!session || session.workerId !== workerId || !session.worktreePath)
      return c.json({ error: 'materialized session not found on worker' }, 404)

    const requestId = randomUUID()
    const resultPromise = runtime.expect(requestId)
    commands.publish(workerId, {
      cmd: 'service.run',
      requestId,
      sessionId: session.id,
      name,
      argv,
    })
    const result = await resultPromise
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.json(result, 201)
  })

  app.delete('/workers/:workerId/services/:name', async c => {
    const workerId = intParam(c.req.param('workerId'))
    const worker = await store.workers.get(workerId)
    if (!worker) return c.json({ error: 'worker not found' }, 404)
    const denied = await assertProjectAccess(c, store, worker.projectId)
    if (denied) return denied
    if (!ownsTargetWorker(c.get('workerId'), workerId))
      return c.json({ error: 'a worker may only manage its own services' }, 403)
    if (!commands.has(workerId)) return c.json({ error: 'worker is offline' }, 409)
    const name = c.req.param('name')
    if (!isServiceName(name)) return c.json({ error: 'invalid service name' }, 400)

    const requestId = randomUUID()
    const resultPromise = runtime.expect(requestId)
    commands.publish(workerId, { cmd: 'service.stop', requestId, name })
    const result = await resultPromise
    if (!result.ok) return c.json({ error: result.error }, result.status)
    return c.body(null, 204)
  })

  app.put('/workers/me/services', workerBearerAuth(store), async c => {
    const worker = c.get('worker')
    const body = (await c.req.json()) as Partial<ServiceReport>
    const ownedSessionIds = new Set(
      (await store.sessions.listByProject(worker.projectId))
        .filter(session => session.workerId === worker.id)
        .map(session => session.id),
    )
    const services = Array.isArray(body.services)
      ? body.services.filter(
          service =>
            typeof service?.sessionId === 'number' &&
            ownedSessionIds.has(service.sessionId) &&
            isServiceName(service.name) &&
            typeof service.startedAt === 'number',
        )
      : []
    runtime.replace(worker.id, services)
    if (body.result) runtime.resolve(body.result)
    return c.json({ ok: true })
  })
}
