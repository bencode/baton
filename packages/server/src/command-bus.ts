import type { WorkerCommand } from '@baton/shared'
import { createPubSub, type PubSub } from './pubsub.ts'

// Worker command bus: server→worker push keyed by workerId. A persistent worker
// daemon subscribes (GET /workers/me/stream) and receives session.start /
// session.stop / session.delete commands. Live-only, like the event bus.
export type CommandBus = PubSub<WorkerCommand>

export const createCommandBus = (): CommandBus => createPubSub<WorkerCommand>('command-bus')
