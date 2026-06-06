import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { BatonClient } from './client.ts'
import { parseNewCommand } from './commands.ts'
import { ensureSession } from './ensure-session.ts'

test('parseNewCommand: /new with and without a message', () => {
  assert.deepEqual(parseNewCommand('/new 帮我看个 bug'), { forceNew: true, text: '帮我看个 bug' })
  assert.deepEqual(parseNewCommand('  /new  '), { forceNew: true, text: '' })
  assert.deepEqual(parseNewCommand('/newx 不是命令'), { forceNew: false, text: '/newx 不是命令' })
  assert.deepEqual(parseNewCommand('正文提到 /new 不算'), {
    forceNew: false,
    text: '正文提到 /new 不算',
  })
})

test('ensureSession: forceNew skips the bound active session and rebinds', async () => {
  const map = new Map<string, number>()
  const bindings = {
    get: (k: string) => map.get(k),
    set: (k: string, id: number) => void map.set(k, id),
  }
  let nextId = 100
  const client = {
    getSession: async (id: number) => ({ id, attached: true }),
    createSession: async () => ({ id: ++nextId, attached: true }),
  } as unknown as BatonClient
  const route = { projectId: 1, workerId: 1 }
  const opts = { tries: 1, intervalMs: 0, sleep: async () => {} }
  map.set('k', 7)
  // Without forceNew the active bound session is reused…
  const reused = await ensureSession(client, bindings, route, 'k', opts)
  assert.equal(reused, 7)
  // …with forceNew a fresh one is created and the binding moves to it.
  const fresh = await ensureSession(client, bindings, route, 'k', {
    ...opts,
    forceNew: true,
  })
  assert.equal(fresh, 101)
  assert.equal(map.get('k'), 101)
})
