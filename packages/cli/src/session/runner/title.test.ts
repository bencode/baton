import assert from 'node:assert/strict'
import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { describe, test } from 'node:test'
import type { SpawnImpl } from './spawn.ts'
import { generateTitle, heuristicTitle, sanitizeTitle } from './title.ts'

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

describe('heuristicTitle', () => {
  test('first 5 words; empty → session', () => {
    assert.equal(
      heuristicTitle('curl localhost 8889 again and tell me'),
      'curl localhost 8889 again and',
    )
    assert.equal(heuristicTitle('   '), 'session')
  })
})

describe('generateTitle', () => {
  test('uses claude stdout when present', async () => {
    const t = await generateTitle({
      worktreePath: '/tmp',
      userText: 'curl health',
      assistantText: 'I will hit /health and report the status.',
      spawnImpl: fakeSpawn('  Curl Health Check  '),
    })
    assert.equal(t, 'Curl Health Check')
  })
  test('falls back to the heuristic (from user text) when claude emits nothing', async () => {
    const t = await generateTitle({
      worktreePath: '/tmp',
      userText: 'curl the health endpoint now please',
      assistantText: 'sure',
      spawnImpl: fakeSpawn(''),
    })
    assert.equal(t, 'curl the health endpoint now please'.split(' ').slice(0, 5).join(' '))
  })
})
