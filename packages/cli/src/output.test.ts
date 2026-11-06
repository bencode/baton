import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { Workspace } from '@baton/shared'
import { removed, renderList, renderOne, toJson } from './output.ts'

describe('output', () => {
  const w: Workspace = { id: 1, name: 'eng', createdAt: 0 }

  test('renderOne: human vs json', () => {
    assert.equal(
      renderOne(w, x => `${x.id} ${x.name}`, false),
      '1 eng',
    )
    assert.equal(
      renderOne(w, x => String(x.id), true),
      toJson(w),
    )
  })

  test('renderList: empty / items / json', () => {
    assert.equal(
      renderList<Workspace>([], x => String(x.id), false),
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

  test('removed: human vs json', () => {
    assert.equal(removed('workspace', 9, false), 'deleted workspace 9')
    assert.deepEqual(JSON.parse(removed('workspace', 9, true)), { ok: true, deleted: 9 })
  })
})
