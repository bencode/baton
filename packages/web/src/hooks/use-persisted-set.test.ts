import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, test } from 'vitest'
import { usePersistedSet } from './use-persisted-set'

beforeEach(() => localStorage.clear())

test('has() is false initially; toggle adds and removes', () => {
  const { result } = renderHook(() => usePersistedSet('k'))
  expect(result.current.has('a')).toBe(false)
  act(() => result.current.toggle('a'))
  expect(result.current.has('a')).toBe(true)
  act(() => result.current.toggle('a'))
  expect(result.current.has('a')).toBe(false)
})

test('persists across hook instances via localStorage', () => {
  const { result: first, unmount } = renderHook(() => usePersistedSet('k'))
  act(() => first.current.toggle('x'))
  act(() => first.current.toggle('y'))
  unmount()
  const { result: second } = renderHook(() => usePersistedSet('k'))
  expect(second.current.has('x')).toBe(true)
  expect(second.current.has('y')).toBe(true)
  expect(second.current.has('z')).toBe(false)
})

test('different keys are independent', () => {
  const { result: a } = renderHook(() => usePersistedSet('a'))
  const { result: b } = renderHook(() => usePersistedSet('b'))
  act(() => a.current.toggle('1'))
  expect(a.current.has('1')).toBe(true)
  expect(b.current.has('1')).toBe(false)
})
