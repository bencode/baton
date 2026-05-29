import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import type { ApiClient } from '../client.ts'
import { addSession, projectConfigPath, saveProjectConfig, setWorker } from '../project-config.ts'
import { startSession } from './start.ts'

// startSession walks .baton.json in cwd. We stage a tmp dir + chdir into it,
// seed .baton.json (server / project / worker / optional sessions) before each
// test, and restore cwd / .baton.json on the way out.
const sandbox = (): { dir: string; cfgPath: string; restore: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), 'baton-start-'))
  const prevCwd = process.cwd()
  const prevWorktree = process.env.BATON_WORKTREE_DIR
  process.chdir(dir)
  process.env.BATON_WORKTREE_DIR = join(dir, 'worktrees')
  return {
    dir,
    cfgPath: projectConfigPath(dir),
    restore: () => {
      process.chdir(prevCwd)
      process.env.BATON_WORKTREE_DIR = prevWorktree
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

const seedWorker = (cfgPath: string, projectId: number, workerId: number): void => {
  saveProjectConfig(cfgPath, { server: 'http://localhost:3280', project: projectId })
  setWorker(cfgPath, { id: workerId, name: 'test-laptop', machineId: 'mid-test' })
}

describe('startSession', () => {
  test('attach: existing session owned by this machine, local entry present', async () => {
    const sb = sandbox()
    try {
      seedWorker(sb.cfgPath, 1, 9)
      addSession(sb.cfgPath, 42, {
        name: 'dogfood',
        apiToken: 'tok-old',
        mode: 'worker',
        agentKind: 'claude-code',
        agentSessionId: 'agent-uuid',
        worktreePath: '/tmp/wt-old',
      })

      const c = {
        sessions: {
          findByName: async () => ({
            id: 42,
            projectId: 1,
            workerId: 9,
            mode: 'worker',
            name: 'dogfood',
            agentKind: 'claude-code',
            agentSessionId: 'agent-uuid',
            worktreePath: '/tmp/wt-old',
            createdAt: 0,
            updatedAt: 0,
          }),
        },
      } as unknown as ApiClient

      const { config, created } = await startSession(
        c,
        {
          projectId: 1,
          name: 'dogfood',
          repo: '/tmp/repo',
          resume: false,
          server: 'http://localhost:3280',
          base: 'main',
          worktreeDir: process.env.BATON_WORKTREE_DIR as string,
        },
        () => {},
      )
      assert.equal(created, false)
      assert.equal(config.sessionId, 42)
      assert.equal(config.apiToken, 'tok-old')
    } finally {
      sb.restore()
    }
  })

  test('attach rejected: session belongs to a different worker', async () => {
    const sb = sandbox()
    try {
      seedWorker(sb.cfgPath, 1, 9)
      const c = {
        sessions: {
          findByName: async () => ({
            id: 11,
            projectId: 1,
            workerId: 77,
            mode: 'worker',
            name: 'other',
            agentKind: 'claude-code',
            agentSessionId: 'x',
            worktreePath: '/tmp/x',
            createdAt: 0,
            updatedAt: 0,
          }),
        },
      } as unknown as ApiClient
      await assert.rejects(
        startSession(
          c,
          {
            projectId: 1,
            name: 'other',
            repo: '/tmp/repo',
            resume: false,
            server: 'http://localhost:3280',
            base: 'main',
            worktreeDir: process.env.BATON_WORKTREE_DIR as string,
          },
          () => {},
        ),
        /belongs to worker #77/,
      )
    } finally {
      sb.restore()
    }
  })

  test('resume strict: no session by that name → throw, do not create', async () => {
    const sb = sandbox()
    try {
      seedWorker(sb.cfgPath, 1, 9)
      const c = {
        sessions: { findByName: async () => null },
      } as unknown as ApiClient
      await assert.rejects(
        startSession(
          c,
          {
            projectId: 1,
            name: 'bogus',
            repo: '/tmp/repo',
            resume: true,
            server: 'http://localhost:3280',
            base: 'main',
            worktreeDir: process.env.BATON_WORKTREE_DIR as string,
          },
          () => {},
        ),
        /--resume failed: no session named 'bogus'/,
      )
    } finally {
      sb.restore()
    }
  })

  test('attach rejected: session entry missing from local .baton.json', async () => {
    const sb = sandbox()
    try {
      seedWorker(sb.cfgPath, 1, 9)
      const c = {
        sessions: {
          findByName: async () => ({
            id: 50,
            projectId: 1,
            workerId: 9,
            mode: 'worker',
            name: 'orphan',
            agentKind: 'claude-code',
            agentSessionId: 'x',
            worktreePath: '/tmp/x',
            createdAt: 0,
            updatedAt: 0,
          }),
        },
      } as unknown as ApiClient
      await assert.rejects(
        startSession(
          c,
          {
            projectId: 1,
            name: 'orphan',
            repo: '/tmp/repo',
            resume: false,
            server: 'http://localhost:3280',
            base: 'main',
            worktreeDir: process.env.BATON_WORKTREE_DIR as string,
          },
          () => {},
        ),
        /not in local \.baton\.json/,
      )
    } finally {
      sb.restore()
    }
  })
})
