import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { Requirement, Task, Workspace } from '@baton/shared'
import { fmtRequirement, fmtTask, removed, renderList, renderOne, toJson } from './output.ts'

describe('output', () => {
  const w: Workspace = { id: 'w1', name: 'eng', createdAt: 0 }

  test('renderOne: human vs json', () => {
    assert.equal(
      renderOne(w, x => `${x.id} ${x.name}`, false),
      'w1 eng',
    )
    assert.equal(
      renderOne(w, x => x.id, true),
      toJson(w),
    )
  })

  test('renderList: empty / items / json', () => {
    assert.equal(
      renderList<Workspace>([], x => x.id, false),
      '(none)',
    )
    assert.equal(
      renderList([w], x => x.name, false),
      'eng',
    )
    assert.equal(
      renderList([w], x => x.name, true),
      toJson([w]),
    )
  })

  test('fmt includes status for requirement/task', () => {
    const r: Requirement = {
      id: 'r1',
      projectId: 'p',
      title: 'login',
      resources: [],
      tags: [],
      status: 'active',
      createdAt: 0,
      updatedAt: 0,
    }
    assert.match(fmtRequirement(r), /r1.*\[active\].*login/)
    const t: Task = {
      id: 't1',
      requirementId: 'r',
      title: 'impl',
      requires: [],
      dependsOn: [],
      status: 'todo',
      createdAt: 0,
      updatedAt: 0,
    }
    assert.match(fmtTask(t), /t1.*\[todo\].*impl/)
  })

  test('removed: human vs json', () => {
    assert.equal(removed('workspace', 'w1', false), 'deleted workspace w1')
    assert.deepEqual(JSON.parse(removed('workspace', 'w1', true)), { ok: true, deleted: 'w1' })
  })
})
