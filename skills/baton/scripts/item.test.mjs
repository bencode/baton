// Run with: node --test skills/baton/scripts/
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { classifyRef, extractVerification, lintBody } from './item.mjs'

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

describe('classifyRef', () => {
  test('issue forms: #N, N, url', () => {
    assert.deepEqual(classifyRef('#12'), { kind: 'issue', selector: '12' })
    assert.deepEqual(classifyRef('12'), { kind: 'issue', selector: '12' })
    assert.deepEqual(classifyRef('https://github.com/o/r/issues/12'), {
      kind: 'issue',
      selector: 'https://github.com/o/r/issues/12',
    })
  })
  test('baton forms: R-N, T-N', () => {
    assert.deepEqual(classifyRef('R-2'), { kind: 'baton', code: 'R-2' })
    assert.deepEqual(classifyRef('T-3'), { kind: 'baton', code: 'T-3' })
  })
  test('rejects anything else', () => {
    assert.throws(() => classifyRef('S-1'))
    assert.throws(() => classifyRef('https://github.com/o/r/pull/12'))
  })
})
