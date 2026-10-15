import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ensureExcluded } from './git-exclude.ts'

test('excludes Worker configuration without changing tracked files; accepts a non-Git directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'baton-exclude-'))
  try {
    ensureExcluded(root, '.baton.json')
    execFileSync('git', ['init', '-q', root])
    writeFileSync(join(root, '.baton.json'), 'private-worker-token')
    ensureExcluded(root, '.baton.json')
    ensureExcluded(root, '.baton.json')
    assert.equal(
      execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }),
      '',
    )
    assert.equal(
      readFileSync(join(root, '.git/info/exclude'), 'utf8')
        .split('\n')
        .filter(line => line === '.baton.json').length,
      1,
    )
    writeFileSync(join(root, 'tracked.txt'), 'tracked')
    execFileSync('git', ['-C', root, 'add', 'tracked.txt'])
    ensureExcluded(root, 'tracked.txt')
    assert.equal(
      execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' }),
      'tracked.txt\n',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
