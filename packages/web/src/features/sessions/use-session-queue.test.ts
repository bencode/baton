import type { PendingInput, SessionQueueSnapshot } from '@baton/shared'
import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { expect, test, vi } from 'vitest'
import type { Api } from '../../api'
import { ApiContext } from '../../app/api-context'
import { useSessionQueue } from './use-session-queue'

const input = (id: number): PendingInput => ({
  id,
  sessionId: 1,
  text: String(id),
  images: [],
  attachments: [],
  planMode: false,
  model: null,
  effort: null,
  replyExpected: false,
  createdAt: 0,
})
const snapshot = (revision: number, ids: number[]): SessionQueueSnapshot => ({
  revision,
  items: ids.map(input),
})
const deferred = <T>() => {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
const wrap = (sessions: Partial<Api['sessions']>) => {
  const api = { sessions } as Api
  return ({ children }: { children: ReactNode }) =>
    createElement(ApiContext.Provider, { value: api }, children)
}

test('older fetch cannot restore a cancelled item; reconnect reloads Queue without transcript dependence', async () => {
  const loading = deferred<SessionQueueSnapshot>()
  const listQueue = vi
    .fn()
    .mockReturnValueOnce(loading.promise)
    .mockResolvedValue(snapshot(3, [2]))
  const cancelInput = vi.fn().mockResolvedValue({ removed: true, queue: snapshot(2, []) })
  const hook = renderHook(({ connection }) => useSessionQueue(1, -1, connection), {
    initialProps: { connection: 0 },
    wrapper: wrap({ listQueue, cancelInput }),
  })
  act(() => hook.result.current.applySnapshot(snapshot(1, [1])))
  await act(() => hook.result.current.cancel(1))
  expect(hook.result.current.items).toEqual([])
  await act(async () => {
    loading.resolve(snapshot(1, [1]))
    await loading.promise
  })
  expect(hook.result.current.items).toEqual([])
  await act(async () => hook.rerender({ connection: 1 }))
  expect(listQueue).toHaveBeenCalledTimes(2)
  expect(hook.result.current.items.map(row => row.id)).toEqual([2])
})

test('switching sessions ignores a late cancellation response and reports real cancellation failures', async () => {
  const cancellation = deferred<{ removed: boolean; queue: SessionQueueSnapshot }>()
  const listQueue = vi.fn(async (id: number) => snapshot(1, [id]))
  const cancelInput = vi
    .fn()
    .mockReturnValueOnce(cancellation.promise)
    .mockRejectedValueOnce(new Error('offline'))
  const hook = renderHook(({ id }) => useSessionQueue(id, -1, 0), {
    initialProps: { id: 1 },
    wrapper: wrap({ listQueue, cancelInput }),
  })
  await act(async () => {})
  let pending: Promise<void>
  act(() => {
    pending = hook.result.current.cancel(1)
  })
  expect(hook.result.current.cancelling.has(1)).toBe(true)
  await act(async () => hook.rerender({ id: 2 }))
  await act(async () => {
    cancellation.resolve({ removed: true, queue: snapshot(20, []) })
    await pending
  })
  expect(hook.result.current.items.map(row => row.id)).toEqual([2])
  await act(() => hook.result.current.cancel(2))
  expect(hook.result.current.error).toBe('offline')
  expect(hook.result.current.items.map(row => row.id)).toEqual([2])
  expect(hook.result.current.cancelling.size).toBe(0)
})
