// Run with: node --test skills/baton/scripts/
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
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

test('task closing attributes comments to the inherited Worker without a local config', async () => {
  const root = mkdtempSync(join(tmpdir(), 'baton-item-context-'))
  try {
    const calls = join(root, 'calls.jsonl')
    const stub = join(root, 'baton-stub.mjs')
    const body = GOOD.replace('test -f x.txt\ngrep -q done x.txt', 'printf verified')
    writeFileSync(
      stub,
      `import {appendFileSync} from 'node:fs';
      const args = process.argv.slice(2);
      if (args[1] === 'get') console.log(JSON.stringify({body: ${JSON.stringify(body)}}));
      else appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args) + '\\n');`,
    )
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL('./item.mjs', import.meta.url)), 'close', 'T-3'],
      {
        cwd: root,
        env: { ...process.env, BATON_WORKER_ID: '23', BATON_BIN: `${process.execPath} ${stub}` },
      },
    )
    const commands = readFileSync(calls, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    const comment = commands.find(args => args[1] === 'comment')
    assert.deepEqual(comment.slice(-2), ['--worker', '23'])
    assert.deepEqual(commands.at(-1), ['task', 'set-status', 'T-3', 'done'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
