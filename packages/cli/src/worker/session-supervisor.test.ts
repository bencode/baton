import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { ApiClient } from '../client.ts'
import type { WorkerConfig } from '../project-config.ts'
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
    supervisor.stop(101)
    resolveSync('refs/heads/main')
    await starting
    assert.equal(materializeCalls, 0)
    assert.equal(supervisor.has(101), false)
  })
})
