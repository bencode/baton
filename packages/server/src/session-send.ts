import type { Session, SubmitInputResult } from '@baton/shared'
import type { CommandBus } from './command-bus.ts'
import type { EventBus } from './event-bus.ts'
import type { ProjectBus } from './project-bus.ts'
import type { SessionRuntime } from './session-runtime.ts'
import type { EnqueueInput, Store } from './store/types.ts'

export type DeliverDeps = {
  store: Store
  bus: EventBus
  commands: CommandBus
  runtime: SessionRuntime
  projects: ProjectBus
}

export type DeliverInput = EnqueueInput

// Persist PendingInput and notify the worker. An offline submission is rejected
// before writing; Loop uses the same path and skips its beat when offline.
export const deliverMessage = async (
  session: Session,
  input: DeliverInput,
  deps: DeliverDeps,
): Promise<{ delivered: false } | { delivered: true; result: SubmitInputResult }> => {
  const { store, bus, commands, runtime, projects } = deps
  const active = runtime.isActive(session.id)
  if (!active && !commands.has(session.workerId)) return { delivered: false }
  const mutation = await store.inputs.submit(session.id, input)
  projects.publish(session.projectId, { resource: 'sessions' })
  mutation.events.forEach(event => {
    bus.publish(session.id, event)
  })
  if (!active)
    commands.publish(session.workerId, {
      cmd: 'session.start',
      sessionId: session.id,
      name: session.name,
    })
  return { delivered: true, result: mutation.value }
}
