import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, test } from 'node:test'
import type { WorkerConfig } from '../project-config.ts'
import { createTerminalManager } from './terminal-manager.ts'

const cfg: WorkerConfig = {
  server: 'http://localhost:3280',
  projectId: 1,
  workerId: 9,
  agentKind: 'claude-code',
  name: 'test-worker',
  machineId: 'mid-test',
  apiToken: 'worker-token',
}

describe('terminal manager', () => {
  const dirs: string[] = []
  afterEach(() =>
    dirs.splice(0).forEach(dir => {
      rmSync(dir, { recursive: true, force: true })
    }),
  )

  test('prepares an existing worktree before spawning and refuses when preparation fails', () => {
    const worktree = mkdtempSync(join(tmpdir(), 'baton-terminal-'))
    dirs.push(worktree)
    const prepared: string[] = []
    const logs: string[] = []
    const manager = createTerminalManager({
      cfg,
      log: message => {
        logs.push(message)
      },
      hasChild: () => false,
      prepareWorktree: path => {
        prepared.push(path)
        throw new Error('skill sync failed')
      },
    })

    manager.open(7, 'agent-session', worktree)

    assert.deepEqual(prepared, [worktree])
    assert.equal(manager.has(7), false)
    assert.match(logs.at(-1) ?? '', /worktree preparation failed: Error: skill sync failed/)
  })
})
