import type { AdminOverview } from '@baton/shared'
import { describe, expect, test } from 'vitest'
import { computeStats, toSections } from './sections'

const mk = (parts: {
  projects: unknown[]
  workers: unknown[]
  sessions: unknown[]
  workspaces?: unknown[]
}): AdminOverview => ({ workspaces: [], ...parts }) as unknown as AdminOverview

const sess = (
  id: number,
  projectId: number,
  attached: boolean,
  busy: boolean,
  lastActiveAt = 0,
) => ({
  id,
  projectId,
  workerId: 1,
  attached,
  busy,
  lastActiveAt,
})

const data = mk({
  workspaces: [{ id: 9, name: 'ws' }],
  projects: [
    { id: 1, workspaceId: 9, name: 'alpha' },
    { id: 2, workspaceId: 9, name: 'beta' },
    { id: 3, workspaceId: 9, name: 'no-worker' },
  ],
  workers: [
    { id: 11, projectId: 1, name: 'w-alpha', connected: true },
    { id: 12, projectId: 2, name: 'w-beta', connected: false },
  ],
  sessions: [
    sess(101, 1, true, false, 50),
    sess(102, 1, true, true, 10), // busy → sorts ahead despite older lastActiveAt
    sess(103, 1, false, false), // dormant
    sess(201, 2, true, false),
  ],
})

describe('toSections', () => {
  test('drops worker-less projects, orders busy projects first, busy cards first', () => {
    const out = toSections(data)
    expect(out.map(s => s.key)).toEqual([1, 2]) // project 3 has no worker → gone
    expect(out[0]?.title).toBe('WS / ALPHA')
    // alpha card order: busy 102 ahead of idle 101; dormant counted separately.
    expect(out[0]?.cards.map(c => c.id)).toEqual([102, 101])
    expect(out[0]?.dormant).toBe(1)
  })
})

describe('computeStats', () => {
  test('busy / idle / offline counts', () => {
    expect(computeStats(data)).toEqual({ busy: 1, idle: 2, offline: 1 })
  })
  test('null overview → all zero', () => {
    expect(computeStats(null)).toEqual({ busy: 0, idle: 0, offline: 0 })
  })
})
