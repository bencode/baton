import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { createWorktree, ensureExcluded, syncBaseBranch } from './worktree.ts'

const git = (repo: string, ...args: string[]): string =>
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim()

const commit = (repo: string, message: string): string => {
  execFileSync('git', ['-C', repo, 'commit', '--allow-empty', '-q', '-m', message], {
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Baton Test',
      GIT_AUTHOR_EMAIL: 'baton@example.test',
      GIT_COMMITTER_NAME: 'Baton Test',
      GIT_COMMITTER_EMAIL: 'baton@example.test',
    },
  })
  return git(repo, 'rev-parse', 'HEAD')
}

describe('createWorktree', () => {
  test('empty repo (unborn HEAD) throws a clear error, not "invalid reference"', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baton-wt-empty-'))
    try {
      execFileSync('git', ['-C', dir, 'init', '-q'])
      assert.throws(
        () =>
          createWorktree({
            repo: dir,
            worktreePath: join(dir, 'wt'),
            sessionCode: 'abc12345',
            base: 'main',
          }),
        /repo has no commits/,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('syncBaseBranch', () => {
  test('fetches the remote branch without moving the source checkout', async () => {
    const root = mkdtempSync(join(tmpdir(), 'baton-sync-'))
    try {
      const remote = join(root, 'remote.git')
      const seed = join(root, 'seed')
      const worker = join(root, 'worker')
      execFileSync('git', ['init', '--bare', '-q', remote])
      execFileSync('git', ['init', '-q', '-b', 'main', seed])
      const first = commit(seed, 'first')
      git(seed, 'remote', 'add', 'origin', remote)
      git(seed, 'push', '-q', '-u', 'origin', 'main')
      execFileSync('git', ['clone', '-q', '--branch', 'main', remote, worker])

      const latest = commit(seed, 'latest')
      git(seed, 'push', '-q', 'origin', 'main')
      assert.equal(git(worker, 'rev-parse', 'HEAD'), first)

      const base = await syncBaseBranch(worker, 'main')
      assert.equal(base, 'refs/remotes/origin/main')
      assert.equal(git(worker, 'rev-parse', base), latest)
      assert.equal(git(worker, 'rev-parse', 'HEAD'), first)

      const worktree = join(root, 'worktree')
      createWorktree({ repo: worker, worktreePath: worktree, sessionCode: 'abc12345', base })
      assert.equal(git(worktree, 'rev-parse', 'HEAD'), latest)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('uses a trusted sync helper with non-interactive Git authentication', async () => {
    const root = mkdtempSync(join(tmpdir(), 'baton-sync-helper-'))
    try {
      const remote = join(root, 'remote.git')
      const repo = join(root, 'repo')
      execFileSync('git', ['init', '--bare', '-q', remote])
      execFileSync('git', ['init', '-q', '-b', 'main', repo])
      commit(repo, 'first')
      git(repo, 'remote', 'add', 'origin', remote)
      git(repo, 'push', '-q', '-u', 'origin', 'main')

      const helper = join(root, 'sync-helper.sh')
      writeFileSync(
        helper,
        '#!/bin/sh\nset -e\n[ "$GIT_TERMINAL_PROMPT" = "0" ]\ngit -C "$1" fetch --no-tags origin "+refs/heads/$2:refs/remotes/origin/$2"\ngit -C "$1" rev-parse "refs/remotes/origin/$2"\n',
      )
      chmodSync(helper, 0o755)
      assert.equal(
        await syncBaseBranch(repo, 'main', {
          env: { ...process.env, BATON_GIT_SYNC_BIN: helper },
        }),
        'refs/remotes/origin/main',
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('rejects a helper that exits successfully without reporting the synced commit', async () => {
    const root = mkdtempSync(join(tmpdir(), 'baton-sync-helper-stale-'))
    try {
      const remote = join(root, 'remote.git')
      execFileSync('git', ['init', '--bare', '-q', remote])
      execFileSync('git', ['init', '-q', '-b', 'main', root])
      commit(root, 'first')
      git(root, 'remote', 'add', 'origin', remote)
      git(root, 'push', '-q', '-u', 'origin', 'main')
      await assert.rejects(
        () =>
          syncBaseBranch(root, 'main', {
            env: { ...process.env, BATON_GIT_SYNC_BIN: '/usr/bin/true' },
          }),
        /did not report the synced commit/,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('times out a stuck sync helper', async () => {
    const root = mkdtempSync(join(tmpdir(), 'baton-sync-timeout-'))
    try {
      const remote = join(root, 'remote.git')
      const repo = join(root, 'repo')
      execFileSync('git', ['init', '--bare', '-q', remote])
      execFileSync('git', ['init', '-q', '-b', 'main', repo])
      commit(repo, 'first')
      git(repo, 'remote', 'add', 'origin', remote)
      git(repo, 'push', '-q', '-u', 'origin', 'main')

      const helper = join(root, 'stuck-helper.sh')
      writeFileSync(helper, '#!/bin/sh\nsleep 2\n')
      chmodSync(helper, 0o755)
      await assert.rejects(
        () =>
          syncBaseBranch(repo, 'main', {
            env: { ...process.env, BATON_GIT_SYNC_BIN: helper },
            timeoutMs: 20,
          }),
        /timed out after 20ms/,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('fails closed when a configured remote branch cannot be synced', async () => {
    const root = mkdtempSync(join(tmpdir(), 'baton-sync-fail-'))
    try {
      execFileSync('git', ['init', '-q', '-b', 'main', root])
      commit(root, 'first')
      const remote = join(root, 'remote.git')
      execFileSync('git', ['init', '--bare', '-q', remote])
      git(root, 'remote', 'add', 'origin', remote)
      await assert.rejects(
        () => syncBaseBranch(root, 'missing'),
        /git sync failed for origin\/missing/,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('uses a local branch when the repository has no origin', async () => {
    const root = mkdtempSync(join(tmpdir(), 'baton-sync-local-'))
    try {
      execFileSync('git', ['init', '-q', '-b', 'main', root])
      commit(root, 'first')
      assert.equal(await syncBaseBranch(root, 'main'), 'refs/heads/main')
      await assert.rejects(
        () => syncBaseBranch(root, 'missing'),
        /local base branch does not exist: missing/,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

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
