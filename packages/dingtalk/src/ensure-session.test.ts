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
    const r = await ensureSession(client, bindings, route, 'conv-A', fast)
    assert.deepEqual(r, { id: 7, active: true })
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
    const r = await ensureSession(client, memBindings({ 'conv-B': 5 }), route, 'conv-B', fast)
    assert.equal(r.id, 5)
    assert.deepEqual(calls, [])
  })

  test('existing inactive (stopped/auto-stopped) conversation: creates fresh + rebinds, never resumes', async () => {
    const calls: string[] = []
    const client: BatonClient = {
      createSession: async () => {
        calls.push('create')
        return view(20, true)
      },
      // bound session 8 is inactive (stopped/auto-stopped); the fresh one (20) is active.
      getSession: async id => view(id, id !== 8),
      resumeSession: async id => {
        calls.push('resume')
        return view(id, true)
      },
      sendMessage: async () => evt(),
      streamUrl: () => '',
      uploadAttachment: async () => att(),
    }
    const bindings = memBindings({ 'conv-C': 8 })
    const r = await ensureSession(client, bindings, route, 'conv-C', fast)
    assert.equal(r.id, 20) // a fresh session, not the stopped 8
    assert.equal(bindings.get('conv-C'), 20) // rebound to the new one
    assert.deepEqual(calls, ['create']) // created, never resumed
  })

  test('never active: returns active=false after the bounded wait (still bound — messages queue)', async () => {
    const client: BatonClient = {
      createSession: async () => view(3, false),
      getSession: async id => view(id, false),
      resumeSession: async id => view(id, false),
      sendMessage: async () => evt(),
      streamUrl: () => '',
      uploadAttachment: async () => att(),
    }
    const bindings = memBindings()
    const r = await ensureSession(client, bindings, route, 'conv-D', {
      tries: 3,
      intervalMs: 0,
      sleep: async () => {},
    })
    assert.deepEqual(r, { id: 3, active: false })
    assert.equal(bindings.get('conv-D'), 3)
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
    const r = await ensureSession(client, bindings, route, 'conv-E', fast)
    assert.equal(r.id, 12)
    assert.equal(bindings.get('conv-E'), 12)
    assert.ok(calls.includes('create'))
  })
})
