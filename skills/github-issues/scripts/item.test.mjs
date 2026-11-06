// Run with: node --test skills/github-issues/scripts/item.test.mjs
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { extractVerification, issueSelector, lintBody } from './item.mjs'

const GOOD = `## Goal

Ship the thing. After this, X exists.

## Verification

\`\`\`bash
test -f x.txt
grep -q done x.txt
\`\`\`

## Refs

- doc: docs/x.md
`

describe('lintBody', () => {
  test('passes a compliant body', () => {
    assert.deepEqual(lintBody(GOOD), { ok: true, missing: [], hasBlock: true, misplaced: false })
  })
  test('reports missing sections', () => {
    const r = lintBody('## Goal\n\nonly a goal\n')
    assert.equal(r.ok, false)
    assert.deepEqual(r.missing, ['Verification', 'Refs'])
  })
  test('flags a misplaced bash block (prose before it)', () => {
    const body = GOOD.replace(
      '## Verification\n\n```bash',
      '## Verification\n\nrun this:\n\n```bash',
    )
    const r = lintBody(body)
    assert.equal(r.ok, false)
    assert.equal(r.misplaced, true)
  })
  test('flags a Verification section with no bash block at all', () => {
    const body = GOOD.replace(/```bash[\s\S]*?```/, 'manually check it')
    const r = lintBody(body)
    assert.equal(r.ok, false)
    assert.equal(r.misplaced, false)
  })
})

describe('extractVerification', () => {
  test('extracts exactly the block content', () => {
    assert.equal(extractVerification(GOOD), 'test -f x.txt\ngrep -q done x.txt')
  })
  test('undefined when absent', () => {
    assert.equal(extractVerification('## Verification\n\nnothing here'), undefined)
  })
})

describe('issueSelector', () => {
  test('issue forms: #N, N, url', () => {
    assert.equal(issueSelector('#12'), '12')
    assert.equal(issueSelector('12'), '12')
    assert.equal(
      issueSelector('https://github.com/o/r/issues/12'),
      'https://github.com/o/r/issues/12',
    )
  })
  test('rejects anything else', () => {
    assert.throws(() => issueSelector('T-3'))
    assert.throws(() => issueSelector('https://github.com/o/r/pull/12'))
  })
})
