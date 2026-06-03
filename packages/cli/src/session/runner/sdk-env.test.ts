import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, test } from 'node:test'
import { additionalDirs } from './sdk-env.ts'

afterEach(() => {
  delete process.env.BATON_ADD_DIRS
})

describe('additionalDirs', () => {
  test('unset → undefined', () => {
    assert.equal(additionalDirs(), undefined)
  })

  test('keeps absolute existing dirs, drops relative + missing', () => {
    const a = mkdtempSync(join(tmpdir(), 'baton-add-a-'))
    const b = mkdtempSync(join(tmpdir(), 'baton-add-b-'))
    try {
      // a + b exist; a relative path and a non-existent absolute path are dropped.
      process.env.BATON_ADD_DIRS = `${a}:relative/path:/no/such/dir/xyz: ${b} `
      assert.deepEqual(additionalDirs(), [a, b])
    } finally {
      rmSync(a, { recursive: true, force: true })
      rmSync(b, { recursive: true, force: true })
    }
  })

  test('all entries invalid → undefined (not an empty array)', () => {
    process.env.BATON_ADD_DIRS = '/no/such/dir:also/relative'
    assert.equal(additionalDirs(), undefined)
  })
})
