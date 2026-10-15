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

  test('refuses a missing directory and a directory occupied by a headless runner', () => {
    const worktree = mkdtempSync(join(tmpdir(), 'baton-terminal-'))
    dirs.push(worktree)
    const logs: string[] = []
    const manager = createTerminalManager({
      cfg,
      log: message => {
        logs.push(message)
      },
      hasChild: () => false,
    })

    manager.open(7, 'agent-session', join(worktree, 'missing'))

    assert.equal(manager.has(7), false)
    assert.match(logs.at(-1) ?? '', /directory missing/)
    const busy = createTerminalManager({
      cfg,
      log: message => logs.push(message),
      hasChild: () => true,
    })
    busy.open(8, 'agent-session', worktree)
    assert.equal(busy.has(8), false)
    assert.match(logs.at(-1) ?? '', /headless child running/)
  })
})
