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

const mkTask = (id: string, status: TaskStatus, dependsOn: string[] = [], createdAt = 0): Task => ({
  id,
  requirementId: 'r1',
  title: id,
  requires: [],
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

  test('arrangeTasks: depth = longest dependency chain, prerequisites first', () => {
    // design -> impl -> test ; ui depends on design ; ship depends on test + ui
    const tasks = [
      mkTask('ship', 'todo', ['test', 'ui'], 5),
      mkTask('design', 'done', [], 1),
      mkTask('impl', 'in_progress', ['design'], 2),
      mkTask('test', 'todo', ['impl'], 3),
      mkTask('ui', 'todo', ['design'], 4),
    ]
    const depth = depthById(tasks)
    assert.deepEqual(depth, { design: 0, impl: 1, ui: 1, test: 2, ship: 3 })
    // a dependent never sorts before its prerequisite
    const order = arrangeTasks(tasks).map(a => a.task.id)
    assert.ok(order.indexOf('design') < order.indexOf('impl'))
    assert.ok(order.indexOf('impl') < order.indexOf('test'))
    assert.ok(order.indexOf('test') < order.indexOf('ship'))
  })

  test('arrangeTasks: ignores dangling deps and survives cycles', () => {
    // dangling dep -> treated as root; a<->b cycle must still terminate
    const dangling = mkTask('x', 'todo', ['missing'])
    assert.deepEqual(depthById([dangling]), { x: 0 })
    const a = mkTask('a', 'todo', ['b'])
    const b = mkTask('b', 'todo', ['a'])
    const arranged = arrangeTasks([a, b])
    assert.equal(arranged.length, 2)
  })
})
