import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { SessionEvent } from '@baton/shared'
import { createBusy } from './busy.ts'
import { sweepExpired } from './busy-sweep.ts'
import type { EventBus } from './event-bus.ts'
import type { ProjectBus } from './project-bus.ts'
import type { Store } from './store/types.ts'

const ev = (id: number, type: SessionEvent['type'], payload: unknown = {}): SessionEvent => ({
  id,
  sessionId: 1,
  sequence: id,
  type,
  payload,
  createdAt: 0,
})

// Fake store exposing only what the sweep touches; `appended` records writes.
const fakeStore = (events: SessionEvent[]) => {
  const appended: Array<{ type: string; payload: unknown }> = []
  const store = {
    sessions: {
      get: async (id: number) => (id === 1 ? { id, projectId: 9 } : null),
      listEvents: async () => events,
      appendEvent: async (_sid: number, type: SessionEvent['type'], payload: unknown) => {
        const e = ev(events.length + 100, type, payload)
        events.push(e)
        appended.push({ type, payload })
        return e
      },
    },
  } as unknown as Store
  return { store, appended }
}

const recorder = () => {
  const published: number[] = []
  const bumped: number[] = []
  const bus = { publish: (id: number) => published.push(id) } as unknown as EventBus
  const projects = { publish: (id: number) => bumped.push(id) } as unknown as ProjectBus
  return { bus, projects, published, bumped }
}

describe('sweepExpired', () => {
  const ttl = 1000

  test('expired open turn → one synthetic turn_error, publish + bump, then not busy', async () => {
    const { store, appended } = fakeStore([
      ev(1, 'user_message'),
      ev(2, 'turn_start', { messageId: 1 }),
    ])
    const { bus, projects, published, bumped } = recorder()
    const busy = createBusy()
    busy.open(1, 0) // stale at now=2000

    const closed = await sweepExpired({ store, bus, projects, busy }, 2000, ttl)
    assert.equal(closed, 1)
    assert.equal(appended.length, 1)
    assert.equal(appended[0]?.type, 'turn_error')
    assert.equal((appended[0]?.payload as { synthetic?: boolean }).synthetic, true)
    assert.deepEqual(published, [1])
    assert.deepEqual(bumped, [9])
    assert.equal(busy.read(1, 2000, ttl), false)
  })

  test('idempotent: a second sweep does not append again', async () => {
    const { store, appended } = fakeStore([
      ev(1, 'user_message'),
      ev(2, 'turn_start', { messageId: 1 }),
    ])
    const { bus, projects } = recorder()
    const busy = createBusy()
    busy.open(1, 0)
    await sweepExpired({ store, bus, projects, busy }, 2000, ttl)
    await sweepExpired({ store, bus, projects, busy }, 3000, ttl)
    assert.equal(appended.length, 1) // closed after the first → not expired the second time
  })

  test('a turn already closed in the transcript → no synthetic append (race guard)', async () => {
    const { store, appended } = fakeStore([
      ev(1, 'user_message'),
      ev(2, 'turn_start', { messageId: 1 }),
      ev(3, 'turn_complete'),
    ])
    const { bus, projects } = recorder()
    const busy = createBusy()
    busy.open(1, 0) // tracker thinks open, but the transcript shows a real close
    const closed = await sweepExpired({ store, bus, projects, busy }, 2000, ttl)
    assert.equal(closed, 0)
    assert.equal(appended.length, 0)
    assert.equal(busy.read(1, 2000, ttl), false) // sweep dropped the stale entry
  })
})
