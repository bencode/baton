import { WORKER_TEMPLATES, type WorkerTemplate } from '@baton/shared'
import type { ProvisionerBus } from './bus.ts'

export const workerTemplates = (bus: ProvisionerBus, token?: string): WorkerTemplate[] =>
  WORKER_TEMPLATES.map(template => ({
    ...template,
    agentKinds: [...template.agentKinds],
    available: !!token && bus.has('mini'),
  }))
