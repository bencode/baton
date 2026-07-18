import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { ApiClient, WorkerRegisterOutput } from '../client.ts'
import { parseWorkerHandle } from '../util.ts'
import { readOrCreateMachineId } from '../worker/machine-id.ts'
import { registerWorker, resolveBaseBranch } from './worker.ts'

describe('worker helpers', () => {
  test('readOrCreateMachineId: writes a UUID on first call; round-trips on second', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baton-mid-'))
    try {
      const path = join(dir, 'machine-id')
      const first = readOrCreateMachineId(path)
      assert.match(first, /^[0-9a-f-]{36}$/)
      assert.equal(readFileSync(path, 'utf8').trim(), first)
      const second = readOrCreateMachineId(path)
      assert.equal(second, first)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('registerWorker: forwards inputs, patches worker section into .baton.json', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baton-wc-'))
    try {
      let registeredWith: unknown = null
      const c = {
        workers: {
          register: async (input: unknown): Promise<WorkerRegisterOutput> => {
            registeredWith = input
            return {
              worker: {
                id: 42,
                projectId: 1,
                agentKind: (input as { agentKind: 'claude-code' | 'codex' }).agentKind,
                machineId: (input as { machineId: string }).machineId,
                name: (input as { name: string }).name,
                hostname: (input as { hostname: string }).hostname,
                createdAt: 0,
                connected: true,
              },
              apiToken: 'wtok-test',
              outcome: 'created',
            }
          },
        },
      } as unknown as ApiClient
      const cfgPath = join(dir, '.baton.json')
      const { out, configPath } = await registerWorker(
        c,
        {
          projectId: 1,
          name: 'ben-laptop',
          server: 'http://localhost:3280',
          hostname: 'bens-air.local',
          machineId: 'mid-abc',
          agentKind: 'codex',
          baseBranch: 'feature/develop',
        },
        cfgPath,
      )
      assert.equal(out.outcome, 'created')
      assert.equal(out.worker.id, 42)
      assert.equal(configPath, cfgPath)
      assert.deepEqual(registeredWith, {
        projectId: 1,
        agentKind: 'codex',
        machineId: 'mid-abc',
        name: 'ben-laptop',
        hostname: 'bens-air.local',
      })
      const saved = JSON.parse(readFileSync(configPath, 'utf8'))
      assert.equal(saved.server, 'http://localhost:3280')
      assert.equal(saved.project, 1)
      assert.equal(saved.baseBranch, 'feature/develop')
      assert.equal(saved.worker.id, 42)
      assert.equal(saved.worker.machineId, 'mid-abc')
      assert.equal(saved.worker.name, 'ben-laptop')
      assert.equal(saved.worker.agentKind, 'codex')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('resolveBaseBranch uses flag, env, saved config, then current branch', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baton-branch-'))
    try {
      execFileSync('git', ['-C', dir, 'init', '-q', '-b', 'repo-branch'])
      assert.equal(
        resolveBaseBranch({
          flag: ' flag-branch ',
          env: 'env-branch',
          saved: 'saved-branch',
          repo: dir,
        }),
        'flag-branch',
      )
      assert.equal(
        resolveBaseBranch({ env: 'env-branch', saved: 'saved-branch', repo: dir }),
        'env-branch',
      )
      assert.equal(resolveBaseBranch({ saved: 'saved-branch', repo: dir }), 'saved-branch')
      assert.equal(resolveBaseBranch({ repo: dir }), 'repo-branch')
      assert.equal(resolveBaseBranch({ repo: join(dir, 'missing') }), 'main')
      assert.throws(
        () => resolveBaseBranch({ flag: 'bad..branch', repo: dir }),
        /invalid base branch/,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('worker whoami --json includes the effective base branch', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baton-whoami-'))
    try {
      const cfgPath = join(dir, '.baton.json')
      writeFileSync(
        cfgPath,
        JSON.stringify({
          server: 'http://localhost:3280',
          project: 1,
          baseBranch: 'feature/develop',
          worker: {
            id: 42,
            name: 'test-worker',
            machineId: 'mid-test',
            apiToken: 'worker-token',
          },
        }),
      )
      const bin = fileURLToPath(new URL('../../bin/baton.mjs', import.meta.url))
      const output = execFileSync(
        process.execPath,
        [bin, 'worker', 'whoami', '--config', cfgPath, '--json'],
        { cwd: dir, encoding: 'utf8' },
      )
      const identity = JSON.parse(output)
      assert.equal(identity.baseBranch, 'feature/develop')
      assert.equal(identity.projectId, 1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('parseWorkerHandle', () => {
  test('accepts W-N / w-N / bare int; rejects names', () => {
    assert.equal(parseWorkerHandle('7'), 7)
    assert.equal(parseWorkerHandle('W-7'), 7)
    assert.equal(parseWorkerHandle('w-12'), 12)
    assert.equal(parseWorkerHandle(' W-3 '), 3)
    assert.equal(parseWorkerHandle('daily-pro'), null)
    assert.equal(parseWorkerHandle('W-'), null)
    assert.equal(parseWorkerHandle(''), null)
  })
})
