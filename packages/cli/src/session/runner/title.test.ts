import assert from 'node:assert/strict'
import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { describe, test } from 'node:test'
import type { SpawnImpl } from './spawn.ts'
import { generateTitle, sanitizeTitle } from './title.ts'

// Fake claude that emits `out` on stdout then exits 0.
const fakeSpawn =
  (out: string): SpawnImpl =>
  () => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; kill: () => void }
    child.stdout = new EventEmitter()
    child.kill = () => {}
    setImmediate(() => {
      if (out) child.stdout.emit('data', Buffer.from(out))
      child.emit('exit', 0)
    })
    return child as unknown as ChildProcess
  }

describe('sanitizeTitle', () => {
  test('strips quotes / leading label / newlines, collapses + caps', () => {
    assert.equal(sanitizeTitle('Title: "Fix the curl health check"\n'), 'Fix the curl health check')
    assert.equal(sanitizeTitle('  hello   world  '), 'hello world')
    assert.equal(sanitizeTitle('x'.repeat(60)).length, 40)
  })
})

describe('generateTitle', () => {
  const base = {
    worktreePath: '/tmp',
    userText: 'curl the health endpoint and report status',
    assistantText: 'I will hit /health and report the status.',
  }
  test('uses claude stdout when present', async () => {
    const t = await generateTitle({ ...base, spawnImpl: fakeSpawn('  Curl Health Check  ') })
    assert.equal(t, 'Curl Health Check')
  })
  test('declines (null) when the model replies NONE', async () => {
    assert.equal(await generateTitle({ ...base, spawnImpl: fakeSpawn('NONE') }), null)
  })
  test('declines (null) when claude emits nothing', async () => {
    assert.equal(await generateTitle({ ...base, spawnImpl: fakeSpawn('') }), null)
  })
  test('declines (null) for a too-thin exchange without spawning', async () => {
    const spy: SpawnImpl = () => {
      throw new Error('should not spawn for a trivial exchange')
    }
    assert.equal(
      await generateTitle({
        worktreePath: '/tmp',
        userText: 'hi',
        assistantText: '',
        spawnImpl: spy,
      }),
      null,
    )
  })
})
