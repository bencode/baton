import type { SessionView } from '@baton/shared'
import { expect, test } from 'vitest'
import { buildSessionGroups } from './session-list'

const now = new Date(2026, 9, 15, 12).getTime()
const session = (id: number, daysAgo: number, name = `chat-${id}`, workerId = 1) =>
  ({
    id,
    name,
    workerId,
    lastActiveAt: new Date(2026, 9, 15 - daysAgo, 10).getTime(),
  }) as SessionView

test('activity time controls ordering and calendar groups, with id resolving ties', () => {
  const groups = buildSessionGroups(
    [session(9, 8), session(1, 0), session(7, 6), session(3, 1), session(2, 0)],
    { query: '', workerId: null },
    now,
  )
  expect(groups.map(group => [group.label, group.sessions.map(value => value.id)])).toEqual([
    ['Today', [2, 1]],
    ['Yesterday', [3]],
    ['Previous 7 days', [7]],
    ['Earlier', [9]],
  ])
})

test('name search and worker filter compose without reordering the input', () => {
  const sessions = [
    session(1, 0, 'Login', 1),
    session(2, 0, 'LOGIN audit', 2),
    session(3, 0, 'Other', 2),
  ]
  expect(
    buildSessionGroups(sessions, { query: ' login ', workerId: 2 }, now)[0]?.sessions.map(
      value => value.id,
    ),
  ).toEqual([2])
  expect(sessions.map(value => value.id)).toEqual([1, 2, 3])
})
