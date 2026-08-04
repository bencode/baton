import { randomUUID } from 'node:crypto'
import {
  type Id,
  isServiceName,
  isServiceNote,
  isServicePublicUrl,
  type ServiceActionResult,
  type ServiceRunInput,
  type ServiceSnapshot,
} from '@baton/shared'
import type { Hono } from 'hono'
import type { CommandBus } from '../command-bus.ts'
import { workerBearerAuth } from '../middleware/auth.ts'
import { assertProjectAccess } from '../middleware/domain-scope.ts'
import type { ServiceRuntime } from '../service-runtime.ts'
import type { Store } from '../store/types.ts'
import { type AppEnv, intParam } from '../views.ts'

const ownsTargetWorker = (callerWorkerId: Id | undefined, targetWorkerId: Id): boolean =>
  callerWorkerId === undefined || callerWorkerId === targetWorkerId

type ServiceMetadata = Pick<ServiceRunInput, 'publicUrl' | 'note'>

const strictMetadata = (input: { publicUrl?: unknown; note?: unknown }): ServiceMetadata | null => {
  if (input.publicUrl !== undefined && typeof input.publicUrl !== 'string') return null
  if (input.note !== undefined && typeof input.note !== 'string') return null
  const publicUrl = input.publicUrl?.trim() || undefined
  const note = input.note?.trim() || undefined
  if ((publicUrl && !isServicePublicUrl(publicUrl)) || (note && !isServiceNote(note))) return null
  return { ...(publicUrl ? { publicUrl } : {}), ...(note ? { note } : {}) }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null

const reportedService = (value: unknown, ownedSessionIds: Set<Id>): ServiceSnapshot | null => {
  const service = asRecord(value)
  if (
    !service ||
    typeof service.sessionId !== 'number' ||
    !ownedSessionIds.has(service.sessionId) ||
    typeof service.name !== 'string' ||
    !isServiceName(service.name) ||
    typeof service.startedAt !== 'number'
  )
    return null
  const publicUrl =
    typeof service.publicUrl === 'string' && isServicePublicUrl(service.publicUrl.trim())
      ? service.publicUrl.trim()
      : undefined
  const note =
    typeof service.note === 'string' && isServiceNote(service.note.trim())
      ? service.note.trim()
      : undefined
  return {
    sessionId: service.sessionId,
    name: service.name,
    startedAt: service.startedAt,
    ...(publicUrl ? { publicUrl } : {}),
    ...(note ? { note } : {}),
  }
}

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

    const body = (await c.req.json()) as {
      sessionId?: unknown
      name?: unknown
      argv?: unknown
      publicUrl?: unknown
      note?: unknown
    }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const rawArgv = Array.isArray(body.argv) ? body.argv : []
    const argv = rawArgv.filter((arg): arg is string => typeof arg === 'string')
    const metadata = strictMetadata(body)
    if (metadata === null)
      return c.json(
        { error: 'publicUrl must be HTTP(S) and note must be 500 characters or fewer' },
        400,
      )
    if (
      typeof body.sessionId !== 'number' ||
      !Number.isInteger(body.sessionId) ||
      body.sessionId <= 0 ||
      !isServiceName(name) ||
      argv.length === 0 ||
      argv.some(arg => arg.length === 0) ||
      argv.length !== rawArgv.length
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
      ...metadata,
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
    const body = (await c.req.json()) as {
      services?: unknown
      result?: ServiceActionResult
    }
    const ownedSessionIds = new Set(
      (await store.sessions.listByProject(worker.projectId))
        .filter(session => session.workerId === worker.id)
        .map(session => session.id),
    )
    const services = Array.isArray(body.services)
      ? body.services
          .map(service => reportedService(service, ownedSessionIds))
          .filter((service): service is ServiceSnapshot => service !== null)
      : []
    runtime.replace(worker.id, services)
    if (body.result) runtime.resolve(body.result)
    return c.json({ ok: true })
  })
}
