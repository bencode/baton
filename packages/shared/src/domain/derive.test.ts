import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { dependenciesMet, isReady, isTerminal, summarizeTaskProgress } from './derive.ts'
import type { Task, TaskStatus } from './task.ts'

const mkTask = (id: string, status: TaskStatus, dependsOn: string[] = []): Task => ({
  id,
  requirementId: 'r1',
  title: id,
  requires: [],
  dependsOn,
  status,
  createdAt: 0,
  updatedAt: 0,
})

describe('derive', () => {
  test('isTerminal', () => {
    assert.equal(isTerminal('done'), true)
    assert.equal(isTerminal('failed'), true)
    assert.equal(isTerminal('cancelled'), true)
    assert.equal(isTerminal('todo'), false)
    assert.equal(isTerminal('in_progress'), false)
  })

  test('summarizeTaskProgress counts each status', () => {
    const tasks = [
      mkTask('a', 'done'),
      mkTask('b', 'in_progress'),
      mkTask('c', 'failed'),
      mkTask('d', 'todo'),
    ]
    assert.deepEqual(summarizeTaskProgress(tasks), { total: 4, done: 1, inProgress: 1, failed: 1 })
  })

  test('dependenciesMet / isReady: ready only when prerequisites are done', () => {
    const a = mkTask('a', 'done')
    const b = mkTask('b', 'todo', ['a'])
    const byId = new Map([a, b].map(t => [t.id, t] as const))
    assert.equal(dependenciesMet(b, byId), true)
    assert.equal(isReady(b, byId), true)
  })

  test('not ready when a dependency is unfinished', () => {
    const c = mkTask('c', 'in_progress')
    const d = mkTask('d', 'todo', ['c'])
    const byId = new Map([c, d].map(t => [t.id, t] as const))
    assert.equal(dependenciesMet(d, byId), false)
    assert.equal(isReady(d, byId), false)
  })

  test('not ready when status is not todo', () => {
    const a = mkTask('a', 'done')
    const byId = new Map([[a.id, a] as const])
    assert.equal(isReady(a, byId), false)
  })
})
