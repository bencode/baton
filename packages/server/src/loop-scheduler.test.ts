import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Loop, Session, SessionEvent, WorkerCommand } from '@baton/shared'
import type { CommandBus } from './command-bus.ts'
import type { EventBus } from './event-bus.ts'
import { type LoopSchedulerDeps, nextRunAfter, runDueLoops } from './loop-scheduler.ts'
import type { ProjectBus } from './project-bus.ts'
import type { SessionRuntime } from './session-runtime.ts'
import type { LoopPatch, Store } from './store/types.ts'

const loop: Loop = {
  id: 1,
  sessionId: 7,
  message: 'continue the plan',
  intervalSec: 60,
  enabled: true,
  nextRunAt: 0,
  createdAt: 0,
  updatedAt: 0,
}
const session = {
  id: 7,
  projectId: 3,
  workerId: 5,
  name: 's',
  planMode: false,
  model: null,
} as Session

// Minimal fakes covering exactly what runDueLoops + deliverMessage touch.
const makeDeps = (opts: { connected: boolean }) => {
  const updates: { id: number; patch: LoopPatch }[] = []
  const appended: SessionEvent[] = []
  const started: WorkerCommand[] = []
  const store = {
    loops: {
      due: async () => [loop],
      update: async (id: number, patch: LoopPatch) => {
        updates.push({ id, patch })
        return { ...loop, ...patch } as Loop
      },
    },
    sessions: {
      get: async () => session,
      appendEvent: async (sessionId: number, type: string, payload: unknown) => {
        const ev = { id: 99, sessionId, sequence: 0, type, payload, createdAt: 0 } as SessionEvent
        appended.push(ev)
        return ev
      },
      touch: async () => session,
    },
  } as unknown as Store
  const commands = {
    has: () => opts.connected,
    publish: (_workerId: number, cmd: WorkerCommand) => started.push(cmd),
  } as unknown as CommandBus
  const runtime = { isActive: () => false } as unknown as SessionRuntime
  const deps: LoopSchedulerDeps = {
    store,
    commands,
    runtime,
    bus: { publish: () => {} } as unknown as EventBus,
    projects: { publish: () => {} } as unknown as ProjectBus,
  }
  return { deps, updates, appended, started }
}

test('nextRunAfter advances one full interval from now', () => {
  assert.equal(nextRunAfter(1000, 60), 61_000)
})

test('a due loop with a connected worker delivers, wakes it, advances with ok', async () => {
  const { deps, updates, appended, started } = makeDeps({ connected: true })
  await runDueLoops(deps, 1000)
  assert.equal(appended.length, 1) // message persisted
  assert.equal(appended[0]?.type, 'user_message')
  assert.deepEqual(started, [{ cmd: 'session.start', sessionId: 7, name: 's' }]) // worker woken
  assert.equal(updates[0]?.patch.lastStatus, 'ok')
  assert.equal(updates[0]?.patch.nextRunAt, 61_000)
})

test('a due loop with an offline worker is skipped — nothing persisted, schedule still advances', async () => {
  const { deps, updates, appended, started } = makeDeps({ connected: false })
  await runDueLoops(deps, 1000)
  assert.equal(appended.length, 0) // offline → not persisted (not queued)
  assert.equal(started.length, 0)
  assert.equal(updates[0]?.patch.lastStatus, 'skipped_offline')
  assert.equal(updates[0]?.patch.nextRunAt, 61_000)
})
