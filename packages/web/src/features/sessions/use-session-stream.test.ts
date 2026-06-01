import type { SessionEvent } from '@baton/shared'
import { expect, test } from 'vitest'
import { mergeEvents } from './use-session-stream'

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
