import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, test } from 'node:test'
import {
  additionalDirs,
  claudeEffort,
  codexApprovalPolicy,
  codexEffort,
  codexNetworkAccess,
  codexSandboxMode,
} from './sdk-env.ts'

afterEach(() => {
  delete process.env.BATON_ADD_DIRS
  delete process.env.BATON_CODEX_APPROVAL_POLICY
  delete process.env.BATON_CODEX_NETWORK_ACCESS
  delete process.env.BATON_CODEX_SANDBOX_MODE
})

describe('additionalDirs', () => {
  test('unset → undefined', () => {
    assert.equal(additionalDirs(), undefined)
  })

  test('keeps absolute existing dirs, drops relative + missing', () => {
    const a = mkdtempSync(join(tmpdir(), 'baton-add-a-'))
    const b = mkdtempSync(join(tmpdir(), 'baton-add-b-'))
    try {
      // a + b exist; a relative path and a non-existent absolute path are dropped.
      process.env.BATON_ADD_DIRS = `${a}:relative/path:/no/such/dir/xyz: ${b} `
      assert.deepEqual(additionalDirs(), [a, b])
    } finally {
      rmSync(a, { recursive: true, force: true })
      rmSync(b, { recursive: true, force: true })
    }
  })

  test('all entries invalid → undefined (not an empty array)', () => {
    process.env.BATON_ADD_DIRS = '/no/such/dir:also/relative'
    assert.equal(additionalDirs(), undefined)
  })
})

describe('codex env options', () => {
  test('defaults keep current codex behavior', () => {
    assert.equal(codexSandboxMode(false), 'workspace-write')
    assert.equal(codexSandboxMode(true), 'read-only')
    assert.equal(codexApprovalPolicy(), 'never')
    assert.equal(codexNetworkAccess(), undefined)
  })

  test('accepts explicit codex sandbox, approval, and network access', () => {
    process.env.BATON_CODEX_SANDBOX_MODE = 'danger-full-access'
    process.env.BATON_CODEX_APPROVAL_POLICY = 'on-failure'
    process.env.BATON_CODEX_NETWORK_ACCESS = 'true'
    assert.equal(codexSandboxMode(false), 'danger-full-access')
    assert.equal(codexApprovalPolicy(), 'on-failure')
    assert.equal(codexNetworkAccess(), true)
  })

  test('invalid codex env values fall back safely', () => {
    process.env.BATON_CODEX_SANDBOX_MODE = 'full'
    process.env.BATON_CODEX_APPROVAL_POLICY = 'always'
    process.env.BATON_CODEX_NETWORK_ACCESS = 'maybe'
    assert.equal(codexSandboxMode(false), 'workspace-write')
    assert.equal(codexApprovalPolicy(), 'never')
    assert.equal(codexNetworkAccess(), undefined)
  })
})

// A session's effort is the union of both SDKs' enums, so each side has exactly
// one level the other lacks. Neither may ever throw — the worst case is running
// at the nearest supported depth.
describe('effort narrowing', () => {
  test('levels both SDKs share pass through untouched', () => {
    for (const level of ['low', 'medium', 'high', 'xhigh'] as const) {
      assert.equal(claudeEffort(level), level)
      assert.equal(codexEffort(level), level)
    }
  })

  test("each SDK clamps the level it can't express to its nearest neighbour", () => {
    assert.equal(claudeEffort('minimal'), 'low') // claude has no 'minimal'
    assert.equal(codexEffort('max'), 'xhigh') // codex-sdk's typedef stops at 'xhigh'
    assert.equal(claudeEffort('max'), 'max')
    assert.equal(codexEffort('minimal'), 'minimal')
  })

  test('unset or unrecognized → undefined (the SDK default), never a throw', () => {
    assert.equal(claudeEffort(undefined), undefined)
    assert.equal(codexEffort(undefined), undefined)
    // 'ultra' exists in the codex binary but not yet in its SDK typedef.
    assert.equal(codexEffort('ultra'), undefined)
    assert.equal(claudeEffort('higgh'), undefined)
  })
})
