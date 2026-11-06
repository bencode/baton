import type { ProvisionerSignal } from '@baton/shared'
import type { Hono } from 'hono'
import { provisionerAuth } from '../middleware/provisioner-auth.ts'
import { streamBus } from '../sse.ts'
import type { AppEnv } from '../views.ts'
import {
  creationBody,
  loadHostCreation,
  type ProvisioningDeps,
  parseCreationReport,
  registerCreationWorker,
  reportWorkerCreation,
  WorkerCreationError,
} from '../worker-provisioning/service.ts'
import { creationId, creationResponse, readCreationBody } from './worker-creations.ts'

export const registerProvisionerRoutes = (app: Hono<AppEnv>, deps: ProvisioningDeps): void => {
  const auth = provisionerAuth(deps.store)
  app.get('/provisioner/stream', auth, c =>
    creationResponse(c, async () => {
      const hostId = c.get('hostId')
      if (deps.bus.has(hostId))
        throw new WorkerCreationError(409, 'this host already has a provisioner connected')
      return streamBus<ProvisionerSignal>(c, push => deps.bus.subscribe(hostId, push), {
        stop: deps.bus.connection(hostId),
        replay: {
          load: async () =>
            (await deps.store.workerCreations.worklist(hostId)).map(creation => ({
              action: creation.status === 'pending' ? 'create' : 'inspect',
              creationId: creation.id,
            })),
          keyOf: signal => signal.creationId,
        },
      })
    }),
  )
  app.get('/provisioner/worker-creations', auth, c =>
    creationResponse(c, async () =>
      c.json(await deps.store.workerCreations.worklist(c.get('hostId'))),
    ),
  )
  app.get('/provisioner/worker-creations/:id', auth, c =>
    creationResponse(c, async () =>
      c.json(await loadHostCreation(deps.store, c.get('hostId'), creationId(c.req.param('id')))),
    ),
  )
  app.post('/provisioner/worker-creations/:id/progress', auth, c =>
    creationResponse(c, async () => {
      const id = creationId(c.req.param('id'))
      await loadHostCreation(deps.store, c.get('hostId'), id)
      const input = parseCreationReport(await readCreationBody(c))
      return c.json(await reportWorkerCreation(deps, id, input))
    }),
  )
  app.post('/provisioner/worker-creations/:id/worker', auth, c =>
    creationResponse(c, async () => {
      const id = creationId(c.req.param('id'))
      await loadHostCreation(deps.store, c.get('hostId'), id)
      const body = creationBody(await readCreationBody(c))
      if (typeof body.hostname !== 'string') throw new WorkerCreationError(400, 'hostname required')
      return c.json(await registerCreationWorker(deps, id, body.hostname))
    }),
  )
}
