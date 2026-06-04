import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import {
  loadProjectConfig,
  loadProjectConfigOrNull,
  projectConfigPath,
  saveProjectConfig,
  setWorker,
  viewWorker,
  type WorkerConfig,
  worktreeConfig,
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

  test('worktreeConfig is the inverse of viewWorker', () => {
    const w: WorkerConfig = {
      server: 'http://x',
      projectId: 1,
      workerId: 9,
      name: 'w',
      machineId: 'mid',
      apiToken: 'wtok',
    }
    assert.deepEqual(viewWorker(worktreeConfig(w)), w)
  })

  test('setWorker + viewWorker round-trip (carries apiToken)', () => {
    const root = mkdtempSync(join(tmpdir(), 'baton-cfg-rmw-'))
    try {
      const p = projectConfigPath(root)
      saveProjectConfig(p, { server: 'http://x', project: 1 })
      setWorker(p, { id: 9, name: 'w', machineId: 'mid', apiToken: 'wtok' })
      const w = viewWorker(loadProjectConfig(p))
      assert.equal(w.workerId, 9)
      assert.equal(w.machineId, 'mid')
      assert.equal(w.apiToken, 'wtok')
      assert.equal(w.server, 'http://x')
      assert.equal(w.projectId, 1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
