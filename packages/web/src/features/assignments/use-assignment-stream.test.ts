import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useAssignmentStream } from './use-assignment-stream'

// Minimal EventSource fake that lets tests trigger onopen / onmessage / onerror.
type FakeES = {
  onopen?: () => void
  onmessage?: (e: MessageEvent) => void
  onerror?: () => void
  close: () => void
}

let lastInstance: FakeES | null = null

beforeEach(() => {
  lastInstance = null
  class MockEventSource {
    onopen?: () => void
    onmessage?: (e: MessageEvent) => void
    onerror?: () => void
    constructor(public url: string) {
      lastInstance = this
    }
    close() {}
  }
  vi.stubGlobal('EventSource', MockEventSource)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

test('subscribes on mount, appends events on message, dedupes by sequence', () => {
  const { result } = renderHook(() => useAssignmentStream(42))
  expect(result.current.status).toBe('connecting')
  expect(result.current.events).toEqual([])

  act(() => lastInstance?.onopen?.())
  expect(result.current.status).toBe('open')

  act(() =>
    lastInstance?.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({
          id: 1,
          assignmentId: 42,
          sequence: 0,
          payload: { type: 'a' },
          createdAt: 0,
        }),
      }),
    ),
  )
  expect(result.current.events).toHaveLength(1)
  // Duplicate sequence ignored.
  act(() =>
    lastInstance?.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({
          id: 1,
          assignmentId: 42,
          sequence: 0,
          payload: { type: 'a' },
          createdAt: 0,
        }),
      }),
    ),
  )
  expect(result.current.events).toHaveLength(1)
  act(() =>
    lastInstance?.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({
          id: 2,
          assignmentId: 42,
          sequence: 1,
          payload: { type: 'b' },
          createdAt: 0,
        }),
      }),
    ),
  )
  expect(result.current.events.map(e => e.sequence)).toEqual([0, 1])
})

test('null assignmentId → closed status, no events, no EventSource constructed', () => {
  const { result } = renderHook(() => useAssignmentStream(null))
  expect(result.current.status).toBe('closed')
  expect(result.current.events).toEqual([])
  expect(lastInstance).toBe(null)
})
