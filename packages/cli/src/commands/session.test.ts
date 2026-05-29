import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import type { ApiClient } from '../client.ts'
import { newSession, parseEnvPairs, type SessionNewInput } from './session.ts'

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

// Common test input — M2.6.1 requires workerId + agentKind + agentSessionId
// snapshot fields.
const baseInput = (worktreeDir: string, name: string): SessionNewInput => ({
  projectId: 1,
  workerId: 9,
  workerName: 'test-laptop',
  workerMachineId: 'mid-test',
  name,
  repo: '/tmp/source',
  base: 'main',
  worktreeDir,
  mode: 'worker',
  agentKind: 'claude-code',
  server: 'http://localhost:3280',
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
            workerId: number
            mode: string
            name: string
            agentKind: string
            agentSessionId: string
            worktreePath: string
          }) => {
            registeredWith = input
            return {
              id: 7,
              projectId: input.projectId,
              workerId: input.workerId,
              mode: input.mode,
              name: input.name,
              agentKind: input.agentKind,
              agentSessionId: input.agentSessionId,
              worktreePath: input.worktreePath,
              createdAt: 0,
              updatedAt: 0,
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
      const { config, path } = await newSession(c, baseInput(dir, 'dogfood'), fakeFs, sid =>
        join(dir, `cfg-${sid}.json`),
      )
      assert.equal(config.sessionId, 7)
      assert.equal(config.apiToken, 'tok-deadbeef')
      assert.equal(config.workerId, 9)
      assert.equal(config.agentKind, 'claude-code')
      assert.equal(config.workerMachineId, 'mid-test')
      assert.ok(createdAt)
      assert.equal((createdAt as { repo: string }).repo, '/tmp/source')
      assert.match((createdAt as { worktreePath: string }).worktreePath, /baton-session-/)
      const saved = JSON.parse(readFileSync(path, 'utf8'))
      assert.equal(saved.apiToken, 'tok-deadbeef')
      assert.equal(saved.workerId, 9)
      assert.equal(
        saved.agentSessionId,
        (registeredWith as { agentSessionId: string }).agentSessionId,
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
      newSession(c, baseInput('/tmp/wd', 'rolling-back'), fakeFs, () => '/tmp/never-written.json'),
      /boom/,
    )
    assert.equal(removed, true)
  })
})
