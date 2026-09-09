import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import type { ApiClient } from '../client.ts'
import type { WorkerConfig } from '../project-config.ts'
import { writeRunnerRecord } from './session-process.ts'
import { createSessionSupervisor } from './session-supervisor.ts'

const cfg: WorkerConfig = {
  server: 'http://localhost:3280',
  projectId: 1,
  baseBranch: 'main',
  workerId: 9,
  agentKind: 'codex',
  name: 'test-worker',
  machineId: 'mid-test',
  apiToken: 'worker-token',
}

describe('createSessionSupervisor base sync', () => {
  test('shares an in-flight sync and does not materialize sessions when it fails', async () => {
    let syncCalls = 0
    let materializeCalls = 0
    let rejectSync: (error: Error) => void = () => {}
    const blockedSync = new Promise<string>((_resolve, reject) => {
      rejectSync = reject
    })
    const client = {
      sessions: {
        execution: async () => ({
          paused: false,
          contextResetRequested: false,
          pendingCount: 0,
          turn: null,
          attempt: null,
        }),
        get: async (id: number) => ({
          id,
          agentKind: 'codex',
          agentSessionId: null,
          worktreePath: null,
        }),
        materialize: async () => {
          materializeCalls++
        },
      },
    } as unknown as ApiClient
    const supervisor = createSessionSupervisor({
      client,
      cfg,
      repo: process.cwd(),
      log: () => {},
      hasTerminal: () => false,
      closeTerminal: () => {},
      syncBase: async () => {
        syncCalls++
        return blockedSync
      },
    })

    const first = supervisor.start(101, 'first')
    const second = supervisor.start(102, 'second')
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(syncCalls, 1)

    rejectSync(new Error('sync unavailable'))
    await assert.rejects(first, /sync unavailable/)
    await assert.rejects(second, /sync unavailable/)
    assert.equal(materializeCalls, 0)
    assert.equal(supervisor.has(101), false)
    assert.equal(supervisor.has(102), false)
  })

  test('shares an in-flight start for the same session', async () => {
    let getCalls = 0
    let rejectSync: (error: Error) => void = () => {}
    const blockedSync = new Promise<string>((_resolve, reject) => {
      rejectSync = reject
    })
    const client = {
      sessions: {
        execution: async () => ({
          paused: false,
          contextResetRequested: false,
          pendingCount: 0,
          turn: null,
          attempt: null,
        }),
        get: async (id: number) => {
          getCalls++
          return {
            id,
            agentKind: 'codex',
            agentSessionId: null,
            worktreePath: null,
          }
        },
      },
    } as unknown as ApiClient
    const supervisor = createSessionSupervisor({
      client,
      cfg,
      repo: process.cwd(),
      log: () => {},
      hasTerminal: () => false,
      closeTerminal: () => {},
      syncBase: async () => blockedSync,
    })

    const first = supervisor.start(101, 'first')
    const duplicate = supervisor.start(101, 'first')
    assert.equal(first, duplicate)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(getCalls, 1)

    rejectSync(new Error('sync unavailable'))
    await assert.rejects(first, /sync unavailable/)
    await assert.rejects(duplicate, /sync unavailable/)
  })

  test('stop cancels a start that is waiting for git sync', async () => {
    let materializeCalls = 0
    let resolveSync: (ref: string) => void = () => {}
    const blockedSync = new Promise<string>(resolve => {
      resolveSync = resolve
    })
    const client = {
      sessions: {
        execution: async () => ({
          paused: false,
          contextResetRequested: false,
          pendingCount: 0,
          turn: null,
          attempt: null,
        }),
        get: async (id: number) => ({
          id,
          agentKind: 'codex',
          agentSessionId: null,
          worktreePath: null,
        }),
        materialize: async () => {
          materializeCalls++
        },
      },
    } as unknown as ApiClient
    const supervisor = createSessionSupervisor({
      client,
      cfg,
      repo: process.cwd(),
      log: () => {},
      hasTerminal: () => false,
      closeTerminal: () => {},
      syncBase: async () => blockedSync,
    })

    const starting = supervisor.start(101, 'first')
    await new Promise(resolve => setImmediate(resolve))
    const stopping = supervisor.stop(101)
    resolveSync('refs/heads/main')
    await starting
    await stopping
    assert.equal(materializeCalls, 0)
    assert.equal(supervisor.has(101), false)
  })
})

test('recovery confirms a recorded runner has exited before acknowledging stop; missing identity blocks', async () => {
  const worktreePath = await mkdtemp(join(tmpdir(), 'baton-recovery-test-'))
  const runnerToken = randomUUID()
  const child = spawn(
    process.execPath,
    ['-e', 'setInterval(() => {}, 1000)', '--', '--runner-token', runnerToken],
    { detached: true, stdio: 'ignore' },
  )
  const exited = once(child, 'exit')
  let stopping = true
  let acknowledgements = 0
  try {
    await once(child, 'spawn')
    assert.ok(child.pid)
    const pid = child.pid
    const client = {
      sessions: {
        get: async () => ({ id: 101, workerId: cfg.workerId, worktreePath, name: 'test' }),
        execution: async () => ({
          paused: true,
          contextResetRequested: false,
          pendingCount: 2,
          turn: stopping ? { id: 1, status: 'running' } : null,
          attempt: stopping ? { id: 2, status: 'stopping', runnerToken, stopRequestedAt: 0 } : null,
        }),
        stopped: async () => {
          assert.throws(() => process.kill(-pid, 0), { code: 'ESRCH' })
          acknowledgements++
          stopping = false
          return { outcome: 'aborted' }
        },
      },
    } as unknown as ApiClient
    const supervisor = createSessionSupervisor({
      client,
      cfg,
      repo: process.cwd(),
      log: () => {},
      hasTerminal: () => false,
      closeTerminal: () => {},
    })
    await assert.rejects(supervisor.reconcile(101), /missing record/)
    assert.equal(acknowledgements, 0)
    assert.doesNotThrow(() => process.kill(pid, 0))
    await writeRunnerRecord(worktreePath, {
      server: cfg.server,
      workerId: cfg.workerId,
      sessionId: 101,
      runnerToken,
      pid,
      pgid: pid,
    })
    await supervisor.reconcile(101)
    await exited
    assert.equal(acknowledgements, 1)
    assert.equal(supervisor.has(101), false)
    await supervisor.reconcile(101)
    assert.equal(acknowledgements, 1)
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await exited
    }
    await rm(worktreePath, { recursive: true, force: true })
  }
})
