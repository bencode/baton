import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { resolveBaseUrl, resolveBaseUrlOrNull } from './config.ts'
import { parseDuration, resolveAuth, resolveProjectId, resolveWorkerId, splitCsv } from './util.ts'

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

describe('parseDuration', () => {
  test('unit suffixes and bare seconds', () => {
    assert.equal(parseDuration('90s'), 90)
    assert.equal(parseDuration('30m'), 1800)
    assert.equal(parseDuration('2h'), 7200)
    assert.equal(parseDuration('1d'), 86_400)
    assert.equal(parseDuration('120'), 120) // bare number = seconds
  })
  test('throws on garbage', () => {
    assert.throws(() => parseDuration('abc'))
    assert.throws(() => parseDuration('5x'))
    assert.throws(() => parseDuration(''))
  })
})

test('Worker context wins over cwd configuration and survives a different cwd', () => {
  const root = mkdtempSync(join(tmpdir(), 'baton-context-'))
  const originalCwd = process.cwd()
  const keys = ['BATON_SERVER', 'BATON_PROJECT_ID', 'BATON_WORKER_ID'] as const
  const previous = keys.map(key => process.env[key])
  try {
    process.chdir(root)
    process.env.BATON_SERVER = 'http://worker'
    process.env.BATON_PROJECT_ID = '7'
    process.env.BATON_WORKER_ID = '9'
    assert.equal(resolveBaseUrl(), 'http://worker')
    assert.equal(resolveProjectId({}), 7)
    assert.equal(resolveWorkerId(), 9)
    writeFileSync(
      '.baton.json',
      JSON.stringify({ server: 'http://file', project: 99, worker: { id: 100 } }),
    )
    assert.equal(resolveBaseUrl(), 'http://worker')
    assert.equal(resolveBaseUrlOrNull(), 'http://worker')
    assert.equal(resolveBaseUrl('http://explicit'), 'http://explicit')
    assert.equal(resolveProjectId({ project: 42 }), 42)
    assert.equal(resolveWorkerId(), 9)
    process.env.BATON_WORKER_ID = 'invalid'
    assert.throws(resolveWorkerId, /invalid BATON_WORKER_ID/)
    process.env.BATON_PROJECT_ID = '0'
    assert.throws(() => resolveProjectId({}), /invalid BATON_PROJECT_ID/)
  } finally {
    process.chdir(originalCwd)
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key]
      else process.env[key] = previous[index]
    })
    rmSync(root, { recursive: true, force: true })
  }
})
