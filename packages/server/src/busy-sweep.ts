import type { BusyTracker } from './busy.ts'
import type { CommandBus } from './command-bus.ts'
import type { EventBus } from './event-bus.ts'
import type { ProjectBus } from './project-bus.ts'
import type { Store } from './store/types.ts'

export type SweepDeps = {
  store: Store
  bus: EventBus
  projects: ProjectBus
  busy: BusyTracker
  commands: CommandBus
}

export const sweepExpired = async (deps: SweepDeps, now: number): Promise<number> => {
  const sessions = await deps.store.turns.worklist()
  for (const session of sessions) {
    const mutation = await deps.store.turns.expire(session.id, now)
    mutation.events.forEach(event => {
      deps.bus.publish(session.id, event)
    })
    if (mutation.events.length) deps.projects.publish(session.projectId, { resource: 'sessions' })
    if (!mutation.value.turn) deps.busy.close(session.id)
    if (deps.commands.has(session.workerId))
      deps.commands.publish(session.workerId, { cmd: 'session.reconcile', sessionId: session.id })
  }
  return sessions.length
}

export const startBusySweep = (deps: SweepDeps, tickMs = 30_000): { stop: () => void } => {
  let running = false
  const timer = setInterval(() => {
    if (running) return
    running = true
    void sweepExpired(deps, Date.now())
      .catch(error => console.error('[execution-sweep]', error))
      .finally(() => {
        running = false
      })
  }, tickMs)
  timer.unref()
  return { stop: () => clearInterval(timer) }
}
