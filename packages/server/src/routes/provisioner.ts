import type { ProvisionerSignal } from '@baton/shared'
import type { Hono } from 'hono'
import { provisionerAuth } from '../middleware/provisioner-auth.ts'
import { streamBus } from '../sse.ts'
import type { AppEnv } from '../views.ts'
import {
  creationBody,
  loadWorkerCreation,
  type ProvisioningDeps,
  parseCreationReport,
  registerCreationWorker,
  reportWorkerCreation,
  WorkerCreationError,
} from '../worker-provisioning/service.ts'
import { creationId, creationResponse, readCreationBody } from './worker-creations.ts'

export const registerProvisionerRoutes = (
  app: Hono<AppEnv>,
  deps: ProvisioningDeps,
  token?: string,
): void => {
  const auth = provisionerAuth(token)
  app.get('/provisioner/stream', auth, c =>
    creationResponse(c, async () => {
      if (deps.bus.has('mini'))
        throw new WorkerCreationError(409, 'mini provisioner is already connected')
      return streamBus<ProvisionerSignal>(c, push => deps.bus.subscribe('mini', push), {
        replay: {
          load: async () =>
            (await deps.store.workerCreations.worklist()).map(creation => ({
              action: creation.status === 'pending' ? 'create' : 'inspect',
              creationId: creation.id,
            })),
          keyOf: signal => signal.creationId,
        },
      })
    }),
  )
  app.get('/provisioner/worker-creations', auth, c =>
    creationResponse(c, async () => c.json(await deps.store.workerCreations.worklist())),
  )
  app.get('/provisioner/worker-creations/:id', auth, c =>
    creationResponse(c, async () =>
      c.json(await loadWorkerCreation(deps.store, creationId(c.req.param('id')))),
    ),
  )
  app.post('/provisioner/worker-creations/:id/progress', auth, c =>
    creationResponse(c, async () => {
      const input = parseCreationReport(await readCreationBody(c))
      return c.json(await reportWorkerCreation(deps, creationId(c.req.param('id')), input))
    }),
  )
  app.post('/provisioner/worker-creations/:id/worker', auth, c =>
    creationResponse(c, async () => {
      const body = creationBody(await readCreationBody(c))
      if (typeof body.hostname !== 'string') throw new WorkerCreationError(400, 'hostname required')
      return c.json(
        await registerCreationWorker(deps, creationId(c.req.param('id')), body.hostname),
      )
    }),
  )
}
