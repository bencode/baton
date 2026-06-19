import type { SessionEvent } from '@baton/shared'
import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import type { Api } from '../../api'
import { ApiContext } from '../../app/api-context'
import { mergeEvents, useSessionStream } from './use-session-stream'

const ev = (id: number, sequence: number): SessionEvent =>
  ({
    id,
    sessionId: 1,
    sequence,
    type: 'user_message',
    payload: null,
    createdAt: 0,
  }) as SessionEvent

test('mergeEvents dedupes by id and orders by sequence', () => {
  const history = [ev(10, 0), ev(11, 1)]
  const live = [ev(12, 2), ev(11, 1)] // 11 overlaps history (arrived live before GET returned)
  const merged = mergeEvents(history, live)
  expect(merged.map(e => e.id)).toEqual([10, 11, 12])
  expect(merged.map(e => e.sequence)).toEqual([0, 1, 2])
})

test('mergeEvents is a no-op when incoming is empty', () => {
  const a = [ev(1, 0)]
  expect(mergeEvents(a, [])).toBe(a)
})

test('mergeEvents sorts out-of-order arrivals', () => {
  expect(mergeEvents([ev(3, 2)], [ev(1, 0), ev(2, 1)]).map(e => e.sequence)).toEqual([0, 1, 2])
})

// Fake EventSource: jsdom has none, and we need to inspect close()/reopen and
// drive onopen by hand. Tracks every instance so the test can assert the old
// socket is dropped and a fresh one opened.
class FakeEventSource {
  static OPEN = 1
  static instances: FakeEventSource[] = []
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  constructor(public url: string) {
    FakeEventSource.instances.push(this)
  }
  close() {
    this.closed = true
    this.readyState = 2
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
}

const flush = () =>
  act(async () => {
    await Promise.resolve()
  })
const instance = (i: number): FakeEventSource => {
  const es = FakeEventSource.instances[i]
  if (!es) throw new Error(`expected EventSource #${i}`)
  return es
}

beforeAll(() => {
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource
})
afterAll(() => {
  Reflect.deleteProperty(globalThis, 'EventSource')
})
beforeEach(() => {
  FakeEventSource.instances = []
})

test('returning to the foreground reopens the stream and backfills the gap', async () => {
  const listEvents = vi.fn().mockResolvedValue([])
  const api = {
    sessionStreamUrl: (id: number) => `/sessions/${id}/stream?live=1`,
    sessions: { listEvents },
  } as unknown as Api
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(ApiContext.Provider, { value: api }, children)

  await act(async () => {
    renderHook(() => useSessionStream(1), { wrapper })
  })
  // Mount opens one socket and loads the recent window (no `since`).
  expect(FakeEventSource.instances).toHaveLength(1)
  expect(listEvents.mock.calls[0]?.[1]).not.toHaveProperty('since')
  await act(async () => instance(0).open())
  await flush()

  // Tab comes back to the foreground.
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
  // Old (maybe-dead) socket is dropped; a fresh one replaces it.
  expect(instance(0).closed).toBe(true)
  expect(FakeEventSource.instances).toHaveLength(2)

  await act(async () => instance(1).open())
  await flush()
  // The reopen pulls only the gap since the last seen sequence, not the window.
  expect(listEvents.mock.calls.at(-1)?.[1]).toHaveProperty('since')
})
