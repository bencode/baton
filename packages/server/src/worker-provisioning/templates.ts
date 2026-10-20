import type { WorkerTemplate } from '@baton/shared'
import type { ProvisionerBus } from './bus.ts'

export const workerTemplates = (bus: ProvisionerBus, token?: string): WorkerTemplate[] => [
  {
    id: 'mini-local',
    name: 'mini 开发环境',
    agentKinds: ['claude-code', 'codex', 'pi'],
    available: !!token && bus.has('mini'),
  },
]
