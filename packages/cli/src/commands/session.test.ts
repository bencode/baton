import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { parseEnvPairs } from './session.ts'

describe('parseEnvPairs', () => {
  test('single KEY=VAL', () => {
    assert.deepEqual(parseEnvPairs('FOO=bar'), { FOO: 'bar' })
  })
  test('array of pairs', () => {
    assert.deepEqual(parseEnvPairs(['A=1', 'B=2']), { A: '1', B: '2' })
  })
  test('value containing = sign', () => {
    assert.deepEqual(parseEnvPairs('URL=https://x/api?a=b'), { URL: 'https://x/api?a=b' })
  })
  test('CSV multi-pair in one string (workaround for citty single-flag)', () => {
    assert.deepEqual(parseEnvPairs('HTTPS_PROXY=http://p:80,HTTP_PROXY=http://p:80'), {
      HTTPS_PROXY: 'http://p:80',
      HTTP_PROXY: 'http://p:80',
    })
  })
  test('undefined → undefined', () => {
    assert.equal(parseEnvPairs(undefined), undefined)
  })
  test('missing = throws', () => {
    assert.throws(() => parseEnvPairs('JUSTAKEY'), /KEY=VAL/)
  })
})
