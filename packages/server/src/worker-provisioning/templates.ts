import { WORKER_TEMPLATES, type WorkerTemplate } from '@baton/shared'

export const workerTemplates = (hostOnline: boolean): WorkerTemplate[] =>
  WORKER_TEMPLATES.map(template => ({
    ...template,
    agentKinds: [...template.agentKinds],
    available: hostOnline,
  }))
