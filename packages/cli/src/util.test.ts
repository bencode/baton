import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { parseIssueUrl, splitCsv } from './util.ts'

describe('splitCsv', () => {
  test('parses / trims / drops empties; undefined when absent', () => {
    assert.deepEqual(splitCsv('a, b ,,c'), ['a', 'b', 'c'])
    assert.equal(splitCsv(undefined), undefined)
    assert.equal(splitCsv(''), undefined)
  })
})

describe('parseIssueUrl', () => {
  test('extracts number + canonical url; strips query/fragment', () => {
    assert.deepEqual(parseIssueUrl('https://github.com/acme/app/issues/42'), {
      source: 'github',
      number: 42,
      url: 'https://github.com/acme/app/issues/42',
    })
    assert.equal(parseIssueUrl('https://github.com/acme/app/issues/42#issuecomment-1').number, 42)
  })
  test('rejects non-issue urls', () => {
    assert.throws(() => parseIssueUrl('https://github.com/acme/app/pull/42'))
    assert.throws(() => parseIssueUrl('acme/app#42'))
  })
})
