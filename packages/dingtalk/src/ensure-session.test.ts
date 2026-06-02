import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { Attachment, Id, SessionEvent, SessionView } from '@baton/shared'
import type { BindingStore } from './bindings.ts'
import type { BatonClient } from './client.ts'
import { ensureSession } from './ensure-session.ts'

// Minimal SessionView fake — ensureSession only reads id + attached.
const view = (id: Id, attached: boolean): SessionView =>
  ({ id, attached }) as unknown as SessionView
// ensureSession never inspects send/upload results; satisfy the types cheaply.
const evt = (): SessionEvent => ({}) as unknown as SessionEvent
const att = (): Attachment => ({}) as unknown as Attachment

const memBindings = (seed: Record<string, Id> = {}): BindingStore => {
  const m = new Map<string, Id>(Object.entries(seed))
  return {
    get: c => m.get(c),
    set: (c, id) => {
      m.set(c, id)
    },
  }
}

// Fast active-wait: never actually sleeps.
const fast = { intervalMs: 0, sleep: async () => {} }
const route = { projectId: 1 as Id, workerId: 1 as Id }

describe('ensureSession', () => {
  test('new conversation: creates + binds + waits active', async () => {
    const calls: string[] = []
    const client: BatonClient = {
      createSession: async () => {
        calls.push('create')
        return view(7, false)
      },
      getSession: async id => view(id, true),
      resumeSession: async id => view(id, true),
      sendMessage: async () => evt(),
      streamUrl: () => '',
      uploadAttachment: async () => att(),
    }
    const bindings = memBindings()
    const id = await ensureSession(client, bindings, route, 'conv-A', fast)
    assert.equal(id, 7)
    assert.equal(bindings.get('conv-A'), 7)
    assert.ok(calls.includes('create'))
  })

  test('existing active conversation: reuses, no create/resume', async () => {
    const calls: string[] = []
    const client: BatonClient = {
      createSession: async () => {
        calls.push('create')
        return view(99, false)
      },
      getSession: async id => view(id, true),
      resumeSession: async id => {
        calls.push('resume')
        return view(id, true)
      },
      sendMessage: async () => evt(),
      streamUrl: () => '',
      uploadAttachment: async () => att(),
    }
    const id = await ensureSession(client, memBindings({ 'conv-B': 5 }), route, 'conv-B', fast)
    assert.equal(id, 5)
    assert.deepEqual(calls, [])
  })

  test('existing inactive conversation: resumes then waits active', async () => {
    const calls: string[] = []
    let attached = false
    const client: BatonClient = {
      createSession: async () => view(0, false),
      getSession: async id => view(id, attached),
      resumeSession: async id => {
        calls.push('resume')
        attached = true
        return view(id, true)
      },
      sendMessage: async () => evt(),
      streamUrl: () => '',
      uploadAttachment: async () => att(),
    }
    const id = await ensureSession(client, memBindings({ 'conv-C': 8 }), route, 'conv-C', fast)
    assert.equal(id, 8)
    assert.deepEqual(calls, ['resume'])
  })

  test('never active: throws after the bounded wait', async () => {
    const client: BatonClient = {
      createSession: async () => view(3, false),
      getSession: async id => view(id, false),
      resumeSession: async id => view(id, false),
      sendMessage: async () => evt(),
      streamUrl: () => '',
      uploadAttachment: async () => att(),
    }
    await assert.rejects(
      ensureSession(client, memBindings(), route, 'conv-D', {
        tries: 3,
        intervalMs: 0,
        sleep: async () => {},
      }),
      /did not become active/,
    )
  })

  test('bound session gone server-side: creates a fresh one', async () => {
    const calls: string[] = []
    const client: BatonClient = {
      createSession: async () => {
        calls.push('create')
        return view(12, false)
      },
      getSession: async id => {
        if (id === 4) throw new Error('404 not found')
        return view(id, true)
      },
      resumeSession: async id => view(id, true),
      sendMessage: async () => evt(),
      streamUrl: () => '',
      uploadAttachment: async () => att(),
    }
    const bindings = memBindings({ 'conv-E': 4 })
    const id = await ensureSession(client, bindings, route, 'conv-E', fast)
    assert.equal(id, 12)
    assert.equal(bindings.get('conv-E'), 12)
    assert.ok(calls.includes('create'))
  })
})
