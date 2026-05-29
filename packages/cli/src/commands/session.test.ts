import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import type { ApiClient } from '../client.ts'
import { newSession, parseEnvPairs } from './session.ts'

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

describe('newSession', () => {
  test('provisions worktree + registers + saves config', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baton-session-'))
    try {
      let registeredWith: unknown = null
      const c = {
        sessions: {
          register: async (input: {
            projectId: number
            mode: string
            name: string
            claudeSessionId?: string
            worktreePath?: string
          }) => {
            registeredWith = input
            return {
              id: 7,
              projectId: input.projectId,
              mode: input.mode,
              name: input.name,
              claudeSessionId: input.claudeSessionId,
              worktreePath: input.worktreePath,
              startedAt: 0,
              apiToken: 'tok-deadbeef',
            }
          },
        },
      } as unknown as ApiClient
      let createdAt: { repo: string; worktreePath: string; base: string } | null = null
      const fakeFs = {
        createWorktree: (inp: {
          repo: string
          worktreePath: string
          sessionCode: string
          base: string
        }) => {
          createdAt = { repo: inp.repo, worktreePath: inp.worktreePath, base: inp.base }
        },
        removeWorktree: () => {},
      }
      const { config, path } = await newSession(
        c,
        {
          projectId: 1,
          name: 'dogfood',
          repo: '/tmp/source',
          base: 'main',
          worktreeDir: dir,
          mode: 'worker',
          server: 'http://localhost:3280',
        },
        fakeFs,
        sid => join(dir, `cfg-${sid}.json`),
      )
      assert.equal(config.sessionId, 7)
      assert.equal(config.apiToken, 'tok-deadbeef')
      assert.ok(createdAt)
      assert.equal((createdAt as { repo: string }).repo, '/tmp/source')
      assert.match((createdAt as { worktreePath: string }).worktreePath, /baton-session-/)
      const saved = JSON.parse(readFileSync(path, 'utf8'))
      assert.equal(saved.apiToken, 'tok-deadbeef')
      assert.equal(
        saved.claudeSessionId,
        (registeredWith as { claudeSessionId: string }).claudeSessionId,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('rolls back worktree when register fails', async () => {
    let removed = false
    const c = {
      sessions: {
        register: async () => {
          throw new Error('boom')
        },
      },
    } as unknown as ApiClient
    const fakeFs = {
      createWorktree: () => {},
      removeWorktree: () => {
        removed = true
      },
    }
    await assert.rejects(
      newSession(
        c,
        {
          projectId: 1,
          name: 'rolling-back',
          repo: '/tmp/source',
          base: 'main',
          worktreeDir: '/tmp/wd',
          mode: 'worker',
          server: 'http://localhost:3280',
        },
        fakeFs,
        () => '/tmp/never-written.json',
      ),
      /boom/,
    )
    assert.equal(removed, true)
  })
})
