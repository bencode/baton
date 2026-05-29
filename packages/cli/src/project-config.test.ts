import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import {
  addSession,
  findSessionId,
  loadProjectConfig,
  loadProjectConfigOrNull,
  projectConfigPath,
  removeSession,
  saveProjectConfig,
  setWorker,
  viewSession,
  viewWorker,
} from './project-config.ts'

describe('project-config', () => {
  test('save + load round-trip', () => {
    const root = mkdtempSync(join(tmpdir(), 'baton-cfg-'))
    try {
      const cfgPath = projectConfigPath(root)
      saveProjectConfig(cfgPath, {
        server: 'http://localhost:3280',
        workspace: 1,
        project: 7,
        name: 'baton',
      })
      const cfg = loadProjectConfig(cfgPath)
      assert.equal(cfg.project, 7)
      assert.equal(cfg.workspace, 1)
      assert.equal(cfg.server, 'http://localhost:3280')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('loadProjectConfigOrNull returns null when file missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'baton-cfg-none-'))
    try {
      assert.equal(loadProjectConfigOrNull(projectConfigPath(root)), null)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('setWorker + addSession + view round-trip', () => {
    const root = mkdtempSync(join(tmpdir(), 'baton-cfg-rmw-'))
    try {
      const p = projectConfigPath(root)
      saveProjectConfig(p, { server: 'http://x', project: 1 })
      setWorker(p, { id: 9, name: 'w', machineId: 'mid' })
      addSession(p, 7, {
        name: 'dogfood',
        apiToken: 'tok',
        mode: 'worker',
        agentKind: 'claude-code',
        agentSessionId: 'agent-uuid',
        worktreePath: '/tmp/wt',
      })
      const cfg = loadProjectConfig(p)
      const w = viewWorker(cfg)
      assert.equal(w.workerId, 9)
      assert.equal(w.machineId, 'mid')
      const s = viewSession(cfg, 7)
      assert.equal(s.apiToken, 'tok')
      assert.equal(s.sessionId, 7)
      assert.equal(s.workerId, 9)
      assert.equal(s.workerMachineId, 'mid')
      assert.equal(findSessionId(cfg, 'dogfood'), 7)
      assert.equal(findSessionId(cfg, 7), 7)
      assert.equal(findSessionId(cfg, 'nope'), null)

      removeSession(p, 7)
      const after = loadProjectConfig(p)
      assert.equal(after.sessions?.['7'], undefined)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
