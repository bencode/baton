import type { SessionEvent } from '@baton/shared'
import { act, cleanup, render, renderHook } from '@testing-library/react'
import { Activity, type ActivityProps, createElement, type ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
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
afterEach(cleanup)
beforeEach(() => {
  FakeEventSource.instances = []
})

test('an open live stream does not confirm empty history before its response', async () => {
  let done!: (rows: SessionEvent[]) => void
  const listEvents = vi.fn(
    () =>
      new Promise<SessionEvent[]>(resolve => {
        done = resolve
      }),
  )
  const api = { sessionStreamUrl: () => '/stream', sessions: { listEvents } } as unknown as Api
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(ApiContext.Provider, { value: api }, children)
  const hook = renderHook(() => useSessionStream(1), { wrapper })
  act(() => instance(0).open())
  expect(hook.result.current.status).toBe('open')
  expect(hook.result.current.history.status).toBe('loading')
  await act(async () => {
    done([])
  })
  expect(hook.result.current.history.status).toBe('ready')
  expect(hook.result.current.events).toEqual([])
})

test('history failure remains recoverable independently of the live connection', async () => {
  const listEvents = vi
    .fn()
    .mockRejectedValueOnce(new Error('history unavailable'))
    .mockResolvedValue([ev(1, 0)])
  const api = { sessionStreamUrl: () => '/stream', sessions: { listEvents } } as unknown as Api
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(ApiContext.Provider, { value: api }, children)
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const hook = renderHook(() => useSessionStream(1), { wrapper })
  act(() => instance(0).open())
  await flush()
  expect(hook.result.current.status).toBe('open')
  expect(hook.result.current.history).toEqual({ status: 'error', message: 'history unavailable' })
  await act(() => hook.result.current.retryHistory())
  expect(hook.result.current.events).toHaveLength(1)
  expect(hook.result.current.history.status).toBe('ready')
  expect(errorLog).toHaveBeenCalledWith(
    '[session-stream] history backfill failed',
    expect.any(Error),
  )
  errorLog.mockRestore()
})

test('Activity reactivation preserves paged history while fetching only the missing tail', async () => {
  let finishGap!: (rows: SessionEvent[]) => void
  const rows = Array.from({ length: 200 }, (_, index) => ev(index + 100, index + 900))
  const listEvents = vi
    .fn()
    .mockResolvedValueOnce(rows)
    .mockResolvedValueOnce([ev(1, 7)])
    .mockImplementation(
      () =>
        new Promise<SessionEvent[]>(resolve => {
          finishGap = resolve
        }),
    )
  const api = { sessionStreamUrl: () => '/stream', sessions: { listEvents } } as unknown as Api
  let state!: ReturnType<typeof useSessionStream>
  const Host = () => {
    state = useSessionStream(1)
    return null
  }
  const tree = (mode: 'visible' | 'hidden') =>
    createElement(
      ApiContext.Provider,
      { value: api },
      createElement(Activity, { mode } as ActivityProps, createElement(Host)),
    )
  const view = render(tree('visible'))
  await flush()
  await act(() => state.loadOlder())
  view.rerender(tree('hidden'))
  view.rerender(tree('visible'))
  expect(state.events).toHaveLength(201)
  expect(state.events[0]?.sequence).toBe(7)
  expect(state.history.status).toBe('ready')
  expect(listEvents).toHaveBeenLastCalledWith(1, { since: 1099 })
  await act(async () => {
    finishGap([ev(1000, 1100)])
  })
  expect(state.events).toHaveLength(202)
  expect(state.hasOlder).toBe(false)
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

test('history pagination stops after a short page even when migration left sequence holes', async () => {
  const listEvents = vi
    .fn()
    .mockResolvedValueOnce(Array.from({ length: 200 }, (_, index) => ev(index + 100, index + 900)))
    .mockResolvedValueOnce([ev(1, 7)])
    .mockResolvedValue([])
  const api = { sessionStreamUrl: () => '/stream', sessions: { listEvents } } as unknown as Api
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(ApiContext.Provider, { value: api }, children)
  const hook = renderHook(() => useSessionStream(1), { wrapper })
  await flush()
  expect(hook.result.current.hasOlder).toBe(true)
  const beforePrepend = vi.fn(() => {
    expect(hook.result.current.events[0]?.sequence).toBe(900)
  })
  await act(async () => hook.result.current.loadOlder(beforePrepend))
  expect(beforePrepend).toHaveBeenCalledTimes(1)
  expect(listEvents.mock.calls[1]?.[1]).toEqual({ before: 900, limit: 600 })
  expect(hook.result.current.events[0]?.sequence).toBe(7)
  expect(hook.result.current.hasOlder).toBe(false)
  await act(async () => instance(0).open())
  const connected = hook.result.current.connectionRevision
  await act(async () => instance(0).open())
  expect(hook.result.current.connectionRevision).toBe(connected + 1)
})

test('failed history or an obsolete session never arms a prepend marker', async () => {
  const history = Array.from({ length: 200 }, (_, index) => ev(index + 100, index + 900))
  let resolveOlder: ((value: SessionEvent[]) => void) | undefined
  const older = new Promise<SessionEvent[]>(resolve => {
    resolveOlder = resolve
  })
  const listEvents = vi
    .fn()
    .mockResolvedValueOnce(history)
    .mockRejectedValueOnce(new Error('offline'))
    .mockReturnValueOnce(older)
    .mockResolvedValue([])
  const api = { sessionStreamUrl: () => '/stream', sessions: { listEvents } } as unknown as Api
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(ApiContext.Provider, { value: api }, children)
  const hook = renderHook(({ id }) => useSessionStream(id), { wrapper, initialProps: { id: 1 } })
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const beforePrepend = vi.fn()
  await flush()
  await act(async () => hook.result.current.loadOlder(beforePrepend))
  expect(errorLog).toHaveBeenCalledWith('[session-stream] load older failed', expect.any(Error))
  expect(beforePrepend).not.toHaveBeenCalled()
  let pending: Promise<void> | undefined
  act(() => {
    pending = hook.result.current.loadOlder(beforePrepend)
  })
  hook.rerender({ id: 2 })
  await act(async () => {
    resolveOlder?.([ev(1, 0)])
    await pending
  })
  expect(beforePrepend).not.toHaveBeenCalled()
  expect(hook.result.current.events).toEqual([])
  errorLog.mockRestore()
})
