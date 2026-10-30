import type { Workspace } from '@baton/shared'
import { beforeEach, expect, test } from 'vitest'
import { loadLastPath, resolveLandingPath, saveLastPath } from './last-location'

const ws = (id: number): Workspace => ({ id, name: `ws-${id}`, createdAt: 0 })
const list = [ws(3), ws(5)]

beforeEach(() => localStorage.clear())

test('last locations are isolated by authenticated user', () => {
  saveLastPath('user-1', '/proj/9')
  saveLastPath('user-2', '/proj/12')

  expect(loadLastPath('user-1')).toBe('/proj/9')
  expect(loadLastPath('user-2')).toBe('/proj/12')
  expect(loadLastPath('user-3')).toBeNull()
})

test('resolveLandingPath restores a real saved path, else falls back to first workspace', () => {
  // Project/session paths restore as-is (can't be validated here).
  expect(resolveLandingPath('/proj/9', list)).toBe('/proj/9')
  // A saved workspace still in the list restores; a stale one falls back.
  expect(resolveLandingPath('/ws/5', list)).toBe('/ws/5')
  expect(resolveLandingPath('/ws/999', list)).toBe('/ws/3')
  // No saved path, or one that parses to home, falls back to the first workspace.
  expect(resolveLandingPath(null, list)).toBe('/ws/3')
  expect(resolveLandingPath('/', list)).toBe('/ws/3')
  // No workspaces yet → nowhere to send.
  expect(resolveLandingPath('/proj/9', [])).toBeNull()
})
