import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { ensureExcluded } from './worktree.ts'

describe('ensureExcluded', () => {
  test('appends once; second call is a no-op; non-git repo does not throw', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baton-excl-'))
    try {
      execFileSync('git', ['-C', dir, 'init', '-q'])
      ensureExcluded(dir, '.baton.json')
      ensureExcluded(dir, '.baton.json')
      const exclude = readFileSync(join(dir, '.git', 'info', 'exclude'), 'utf8')
      const hits = exclude.split('\n').filter(l => l === '.baton.json')
      assert.equal(hits.length, 1)
      assert.ok(exclude.endsWith('.baton.json\n'))
      // best-effort on a plain directory: silently ignored
      const plain = mkdtempSync(join(tmpdir(), 'baton-excl-plain-'))
      try {
        assert.doesNotThrow(() => ensureExcluded(plain, '.baton.json'))
      } finally {
        rmSync(plain, { recursive: true, force: true })
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
