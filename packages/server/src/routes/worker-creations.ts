import type { Context, Hono } from 'hono'
import { assertProjectAccess } from '../middleware/domain-scope.ts'
import type { Store } from '../store/types.ts'
import type { AppEnv } from '../views.ts'
import {
  createWorkerCreation,
  loadWorkerCreation,
  type ProvisioningDeps,
  parseCreateWorkerInput,
  WorkerCreationError,
} from '../worker-provisioning/service.ts'
import { workerTemplates } from '../worker-provisioning/templates.ts'

export const creationId = (raw: string): number => {
  const id = Number(raw)
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new WorkerCreationError(400, 'positive id required')
  return id
}
export const readCreationBody = async (c: Context<AppEnv>): Promise<unknown> => {
  try {
    return await c.req.json<unknown>()
  } catch (error) {
    if (error instanceof SyntaxError) throw new WorkerCreationError(400, 'invalid JSON body')
    throw error
  }
}
export const creationResponse = async (
  c: Context<AppEnv>,
  run: () => Promise<Response>,
): Promise<Response> => {
  try {
    return await run()
  } catch (error) {
    if (error instanceof WorkerCreationError) return c.json({ error: error.message }, error.status)
    throw error
  }
}
const projectAccess = async (
  c: Context<AppEnv>,
  store: Store,
  projectId: number,
): Promise<Response | null> => {
  if (!(await store.projects.get(projectId))) return c.json({ error: 'not found' }, 404)
  const workerId = c.get('workerId')
  if (workerId !== undefined) {
    const worker = await store.workers.get(workerId)
    return worker?.projectId === projectId ? null : c.json({ error: 'not found' }, 404)
  }
  return assertProjectAccess(c, store, projectId)
}

export const registerWorkerCreationRoutes = (
  app: Hono<AppEnv>,
  deps: ProvisioningDeps,
  token?: string,
): void => {
  app.get('/projects/:id/worker-templates', c =>
    creationResponse(c, async () => {
      const projectId = creationId(c.req.param('id'))
      const denied = await projectAccess(c, deps.store, projectId)
      return denied ?? c.json(workerTemplates(deps.bus, token))
    }),
  )
  app.post('/projects/:id/worker-creations', c =>
    creationResponse(c, async () => {
      const projectId = creationId(c.req.param('id'))
      const denied = await projectAccess(c, deps.store, projectId)
      if (denied) return denied
      if (!token) throw new WorkerCreationError(503, 'mini provisioner is not configured')
      const input = parseCreateWorkerInput(await readCreationBody(c))
      return c.json(await createWorkerCreation(deps, projectId, input), 202)
    }),
  )
  app.get('/projects/:id/worker-creations', c =>
    creationResponse(c, async () => {
      const projectId = creationId(c.req.param('id'))
      const denied = await projectAccess(c, deps.store, projectId)
      return denied ?? c.json(await deps.store.workerCreations.listByProject(projectId))
    }),
  )
  app.get('/worker-creations/:id', c =>
    creationResponse(c, async () => {
      const creation = await loadWorkerCreation(deps.store, creationId(c.req.param('id')))
      const denied = await projectAccess(c, deps.store, creation.projectId)
      return denied ?? c.json(creation)
    }),
  )
}
