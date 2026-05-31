import { createPubSub, type PubSub } from './pubsub.ts'

// Project-scoped change bus: server→browser push keyed by projectId. Carries
// lightweight invalidation signals (which resource changed) — never the data
// itself; the web client refetches the matching query. One channel per open
// project (GET /projects/:id/stream). Generalises to tasks with no new
// mechanism — just publish { resource: 'tasks' } where tasks mutate.
export type ProjectSignal = { resource: 'sessions' | 'workers' | 'tasks' }
export type ProjectBus = PubSub<ProjectSignal>

export const createProjectBus = (): ProjectBus => createPubSub<ProjectSignal>('project-bus')
