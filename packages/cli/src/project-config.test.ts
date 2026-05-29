import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import {
  findProjectConfig,
  PROJECT_CONFIG_NAME,
  saveProjectConfig,
} from './project-config.ts'

describe('project-config', () => {
  test('save + find round-trip; walks up from a nested directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'baton-cfg-'))
    try {
      const cfgPath = join(root, PROJECT_CONFIG_NAME)
      saveProjectConfig(cfgPath, {
        server: 'http://localhost:3280',
        workspace: 1,
        project: 7,
        name: 'baton',
      })
      const deep = join(root, 'a', 'b', 'c')
      mkdirSync(deep, { recursive: true })
      const found = findProjectConfig(deep)
      assert.ok(found)
      assert.equal(found.path, cfgPath)
      assert.equal(found.config.project, 7)
      assert.equal(found.config.workspace, 1)
      assert.equal(found.config.server, 'http://localhost:3280')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('returns null when no .baton.json on the path', () => {
    const root = mkdtempSync(join(tmpdir(), 'baton-cfg-none-'))
    try {
      assert.equal(findProjectConfig(root), null)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
