import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  arrangeTasks,
  dependenciesMet,
  isReady,
  isTerminal,
  summarizeTaskProgress,
} from './derive.ts'
import type { Task, TaskStatus } from './task.ts'

const mkTask = (id: number, status: TaskStatus, dependsOn: number[] = [], createdAt = 0): Task => ({
  id,
  requirementId: 1,
  projectId: 1,
  code: `T-${id}`,
  title: `t${id}`,
  dependsOn,
  status,
  createdAt,
  updatedAt: 0,
})

const depthById = (tasks: Task[]) =>
  Object.fromEntries(arrangeTasks(tasks).map(a => [a.task.id, a.depth]))

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
      mkTask(1, 'done'),
      mkTask(2, 'in_progress'),
      mkTask(3, 'failed'),
      mkTask(4, 'todo'),
    ]
    assert.deepEqual(summarizeTaskProgress(tasks), { total: 4, done: 1, inProgress: 1, failed: 1 })
  })

  test('dependenciesMet / isReady: ready only when prerequisites are done', () => {
    const a = mkTask(1, 'done')
    const b = mkTask(2, 'todo', [1])
    const byId = new Map([a, b].map(t => [t.id, t] as const))
    assert.equal(dependenciesMet(b, byId), true)
    assert.equal(isReady(b, byId), true)
  })

  test('not ready when a dependency is unfinished', () => {
    const c = mkTask(3, 'in_progress')
    const d = mkTask(4, 'todo', [3])
    const byId = new Map([c, d].map(t => [t.id, t] as const))
    assert.equal(dependenciesMet(d, byId), false)
    assert.equal(isReady(d, byId), false)
  })

  test('not ready when status is not todo', () => {
    const a = mkTask(1, 'done')
    const byId = new Map([[a.id, a] as const])
    assert.equal(isReady(a, byId), false)
  })

  test('arrangeTasks: depth = longest dependency chain, prerequisites first', () => {
    // design(1) -> impl(2) -> test(3); ui(4) depends on design(1); ship(5) depends on test+ui
    const tasks = [
      mkTask(5, 'todo', [3, 4], 5),
      mkTask(1, 'done', [], 1),
      mkTask(2, 'in_progress', [1], 2),
      mkTask(3, 'todo', [2], 3),
      mkTask(4, 'todo', [1], 4),
    ]
    const depth = depthById(tasks)
    assert.deepEqual(depth, { 1: 0, 2: 1, 4: 1, 3: 2, 5: 3 })
    const order = arrangeTasks(tasks).map(a => a.task.id)
    assert.ok(order.indexOf(1) < order.indexOf(2))
    assert.ok(order.indexOf(2) < order.indexOf(3))
    assert.ok(order.indexOf(3) < order.indexOf(5))
  })

  test('arrangeTasks: ignores dangling deps and survives cycles', () => {
    // dangling dep -> treated as root; 1<->2 cycle must still terminate
    const dangling = mkTask(7, 'todo', [99])
    assert.deepEqual(depthById([dangling]), { 7: 0 })
    const a = mkTask(1, 'todo', [2])
    const b = mkTask(2, 'todo', [1])
    const arranged = arrangeTasks([a, b])
    assert.equal(arranged.length, 2)
  })
})
