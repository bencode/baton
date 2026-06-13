import { expect, test } from 'vitest'
import {
  closeOthers,
  closeTab,
  closeToRight,
  MAX_TABS,
  neighborTab,
  openTab,
  type Tab,
} from './tabs-model'

const ids = (tabs: Tab[]) => tabs.map(t => t.id)

test('openTab appends a new tab with the given recency', () => {
  const s = openTab([], { id: '/t/a', title: 'a' }, 1)
  expect(ids(s)).toEqual(['/t/a'])
  expect(s[0]?.lastActiveAt).toBe(1)
})

test('openTab on an existing tab refreshes recency without duplicating', () => {
  const s1 = openTab([], { id: '/t/a', title: 'a' }, 1)
  const s2 = openTab(s1, { id: '/t/b', title: 'b' }, 2)
  const s3 = openTab(s2, { id: '/t/a', title: 'a' }, 3)
  expect(ids(s3)).toEqual(['/t/a', '/t/b'])
  expect(s3.find(t => t.id === '/t/a')?.lastActiveAt).toBe(3)
})

test('openTab evicts the least-recently-active tab past MAX_TABS', () => {
  let s: Tab[] = []
  for (let i = 0; i < MAX_TABS; i++) s = openTab(s, { id: `/t/${i}`, title: `${i}` }, i + 1)
  // Touch the oldest (/t/0) so it is no longer the LRU candidate.
  s = openTab(s, { id: '/t/0', title: '0' }, 100)
  // Opening one more must evict /t/1 (now the least-recently-active).
  s = openTab(s, { id: '/t/new', title: 'new' }, 101)
  expect(s).toHaveLength(MAX_TABS)
  expect(ids(s)).not.toContain('/t/1')
  expect(ids(s)).toContain('/t/0')
  expect(ids(s)).toContain('/t/new')
})

test('closeTab removes by id; neighborTab picks the positional fallback', () => {
  const s: Tab[] = [
    { id: '/t/a', title: 'a', lastActiveAt: 1 },
    { id: '/t/b', title: 'b', lastActiveAt: 2 },
    { id: '/t/c', title: 'c', lastActiveAt: 3 },
  ]
  expect(neighborTab(s, '/t/b')?.id).toBe('/t/c')
  expect(neighborTab(s, '/t/c')?.id).toBe('/t/b')
  expect(neighborTab(s, '/t/x')).toBeNull()
  expect(ids(closeTab(s, '/t/b'))).toEqual(['/t/a', '/t/c'])
})

test('closeOthers keeps only the anchor tab', () => {
  const s: Tab[] = [
    { id: '/t/a', title: 'a', lastActiveAt: 1 },
    { id: '/t/b', title: 'b', lastActiveAt: 2 },
    { id: '/t/c', title: 'c', lastActiveAt: 3 },
  ]
  expect(ids(closeOthers(s, '/t/b'))).toEqual(['/t/b'])
  expect(ids(closeOthers(s, '/t/x'))).toEqual([]) // unknown anchor → all gone
})

test('closeToRight keeps up to and including the anchor; no-op on unknown / last', () => {
  const s: Tab[] = [
    { id: '/t/a', title: 'a', lastActiveAt: 1 },
    { id: '/t/b', title: 'b', lastActiveAt: 2 },
    { id: '/t/c', title: 'c', lastActiveAt: 3 },
  ]
  expect(ids(closeToRight(s, '/t/b'))).toEqual(['/t/a', '/t/b'])
  expect(ids(closeToRight(s, '/t/c'))).toEqual(['/t/a', '/t/b', '/t/c']) // last → unchanged
  expect(ids(closeToRight(s, '/t/x'))).toEqual(['/t/a', '/t/b', '/t/c']) // unknown → unchanged
})
