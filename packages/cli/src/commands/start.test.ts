import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import type { ApiClient } from '../client.ts'
import { type SessionConfig, saveConfig } from '../session/config.ts'
import { saveWorkerConfig, type WorkerConfig } from '../worker/config.ts'
import { startSession } from './start.ts'

// startSession touches the local filesystem (worker config, session config,
// machine-id, worktree). We stage a per-test XDG_CONFIG_HOME/XDG_DATA_HOME so
// it touches a sandboxed dir instead of the real ~/.config/baton.
const sandbox = (): { root: string; restore: () => void } => {
  const root = mkdtempSync(join(tmpdir(), 'baton-start-'))
  const prev = {
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    XDG_DATA_HOME: process.env.XDG_DATA_HOME,
    BATON_WORKTREE_DIR: process.env.BATON_WORKTREE_DIR,
  }
  process.env.XDG_CONFIG_HOME = join(root, 'config')
  process.env.XDG_DATA_HOME = join(root, 'data')
  process.env.BATON_WORKTREE_DIR = join(root, 'worktrees')
  return {
    root,
    restore: () => {
      process.env.XDG_CONFIG_HOME = prev.XDG_CONFIG_HOME
      process.env.XDG_DATA_HOME = prev.XDG_DATA_HOME
      process.env.BATON_WORKTREE_DIR = prev.BATON_WORKTREE_DIR
      rmSync(root, { recursive: true, force: true })
    },
  }
}

const writeWorkerCfg = (projectId: number, workerId: number): void => {
  const cfg: WorkerConfig = {
    server: 'http://localhost:3280',
    projectId,
    workerId,
    name: 'test-laptop',
    machineId: 'mid-test',
  }
  saveWorkerConfig(
    join(process.env.XDG_CONFIG_HOME as string, 'baton', `worker-${projectId}.json`),
    cfg,
  )
}

describe('startSession', () => {
  test('attach: existing session owned by this machine, local config present', async () => {
    const sb = sandbox()
    try {
      writeWorkerCfg(1, 9)
      // pre-write session config so attach can load it
      const sessCfgPath = join(process.env.XDG_CONFIG_HOME as string, 'baton', 'session-42.json')
      const sessCfg: SessionConfig = {
        server: 'http://localhost:3280',
        apiToken: 'tok-old',
        sessionId: 42,
        projectId: 1,
        workerId: 9,
        name: 'dogfood',
        mode: 'worker',
        agentKind: 'claude-code',
        agentSessionId: 'agent-uuid',
        worktreePath: '/tmp/wt-old',
        workerMachineId: 'mid-test',
      }
      saveConfig(sessCfgPath, sessCfg)

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
      writeWorkerCfg(1, 9)
      const c = {
        sessions: {
          findByName: async () => ({
            id: 11,
            projectId: 1,
            workerId: 77, // different worker
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
      writeWorkerCfg(1, 9)
      const c = {
        sessions: {
          findByName: async () => null,
          // register intentionally absent — if startSession tries to create, this throws
        },
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

  test('attach rejected: session config not found locally', async () => {
    const sb = sandbox()
    try {
      writeWorkerCfg(1, 9)
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
        /config not found/,
      )
    } finally {
      sb.restore()
    }
  })
})
