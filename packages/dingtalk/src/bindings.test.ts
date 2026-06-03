import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createBindingStore } from './bindings.ts'

// The map must survive process restarts (the bridge redeploys) — a fresh store
// pointed at the same file must see what an earlier store wrote.
test('createBindingStore persists to the given path and reloads it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'baton-bindings-'))
  const path = join(dir, 'nested', 'bindings.json') // nested → exercises mkdir
  try {
    const a = createBindingStore(path)
    assert.equal(a.get('conv:user'), undefined)
    a.set('conv:user', 42)
    // On disk + visible to a brand-new store (simulates a restart).
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { 'conv:user': 42 })
    assert.equal(createBindingStore(path).get('conv:user'), 42)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
