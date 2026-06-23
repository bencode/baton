import type { SessionView, WorkerView } from '@baton/shared'
import { expect, test } from 'vitest'
import { groupByWorker, orderSessions } from './grouping'

const session = (id: number, workerId: number, live = false): SessionView =>
  ({ id, workerId, busy: false, attached: live }) as unknown as SessionView

test('orderSessions: live first (input order), then idle newest-first by id', () => {
  const ordered = orderSessions([
    session(1, 1),
    session(2, 1, true),
    session(5, 1),
    session(3, 1, true),
  ])
  // live = 2,3 (kept in input order); idle = 1,5 sorted by id desc → 5,1
  expect(ordered.map(s => s.id)).toEqual([2, 3, 5, 1])
})

test('groupByWorker: every worker gets a bucket; sessions land by workerId', () => {
  const workers = [{ id: 1 }, { id: 2 }] as WorkerView[]
  const groups = groupByWorker(workers, [session(7, 1), session(8, 2), session(9, 1)])
  expect(groups.map(g => g.worker.id)).toEqual([1, 2])
  expect(groups[0]?.sessions.map(s => s.id)).toEqual([7, 9])
  expect(groups[1]?.sessions.map(s => s.id)).toEqual([8])
})
