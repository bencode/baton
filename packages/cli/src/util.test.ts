import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { resolveAuth, splitCsv } from './util.ts'

describe('splitCsv', () => {
  test('parses / trims / drops empties; undefined when absent', () => {
    assert.deepEqual(splitCsv('a, b ,,c'), ['a', 'b', 'c'])
    assert.equal(splitCsv(undefined), undefined)
    assert.equal(splitCsv(''), undefined)
  })
})

describe('resolveAuth', () => {
  test('BATON_TOKEN wins; BATON_WORKER_TOKEN (daemon-injected) is honored too', () => {
    assert.deepEqual(resolveAuth({ BATON_TOKEN: 't' }, 'file'), { bearer: 't' })
    assert.deepEqual(resolveAuth({ BATON_TOKEN: 't', BATON_WORKER_TOKEN: 'w' }, undefined), {
      bearer: 't',
    })
    // The bug this guards: worker token in env must authenticate from any cwd,
    // even when no .baton.json is present.
    assert.deepEqual(resolveAuth({ BATON_WORKER_TOKEN: 'w' }, undefined), { bearer: 'w' })
  })
  test('falls back to user/pass cookie, then cwd file token, then nothing', () => {
    assert.equal(resolveAuth({ BATON_USER: 'u', BATON_PASS: 'p' }, 'file'), 'cookie')
    assert.deepEqual(resolveAuth({}, 'file'), { bearer: 'file' })
    assert.equal(resolveAuth({}, undefined), undefined)
  })
})
