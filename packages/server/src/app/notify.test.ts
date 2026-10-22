import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { NotifyResult } from '@baton/shared'
import { createApp } from '../app.ts'
import type { PushMessage } from '../push-message.ts'
import { freshStore, type TestStore } from '../store/test-db.ts'

describe('server HTTP — baton notify', () => {
  let ctx: TestStore
  let sent: PushMessage[]

  beforeEach(async () => {
    ctx = await freshStore()
    sent = []
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  const worker = async (projectId: number, name: string) => {
    const out = await ctx.store.workers.register({
      projectId,
      machineId: `m-${name}`,
      name,
      hostname: 'h',
    })
    if (out.kind === 'name-collision') throw new Error('unexpected collision')
    return out
  }

  const seed = async () => {
    const workspace = await ctx.store.workspaces.create({ name: 'w' })
    const project = await ctx.store.projects.create({ workspaceId: workspace.id, name: 'baton' })
    const owner = await worker(project.id, 'owner')
    const session = await ctx.store.sessions.create({
      projectId: project.id,
      workerId: owner.worker.id,
      mode: 'worker',
      name: '巡检',
      agentKind: 'codex',
    })
    await ctx.store.sessions.materialize(session.id, { agentSessionId: 'pending:n', cwd: '/tmp/n' })
    const user = await ctx.store.users.create({ username: 'ben', passwordHash: 'x' })
    await ctx.store.push.subscribe(user.id, { endpoint: 'https://push/1', p256dh: 'k', auth: 'a' })
    const app = createApp(ctx.store, {
      sendPush: async (_sub, message) => {
        sent.push(message)
      },
    })
    const notify = async (token: string, text: string) =>
      app.request(`/sessions/${session.id}/notify`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      })
    // One full turn, so the next message starts a turn of its own.
    const say = async (input: { text: string; senderUserId?: number; loopId?: number }) => {
      await ctx.store.inputs.submit(session.id, input)
      const claimed = await ctx.store.turns.claim(session.id, {
        claimId: randomUUID(),
        runnerToken: 'r',
      })
      if (claimed.value.kind !== 'execute') throw new Error('expected a turn to execute')
      await ctx.store.turns.finish(session.id, claimed.value.attempt.id, {
        runnerToken: 'r',
        outcome: 'completed',
        message: '',
      })
    }
    return { project, session, user, owner, notify, say }
  }

  test('pushes to the latest human sender, then throttles the session', async () => {
    const { session, user, owner, notify, say } = await seed()
    await say({ text: 'watch the error rate', senderUserId: user.id })

    const first = await notify(owner.apiToken, '错误率升到 3%，需要你看一下')
    assert.deepEqual((await first.json()) as NotifyResult, { status: 'sent', devices: 1 })
    assert.deepEqual(sent, [
      {
        title: 'baton · 巡检',
        body: '错误率升到 3%，需要你看一下',
        url: `/proj/${session.projectId}/session/${session.id}`,
        tag: `notify-${session.id}`,
      },
    ])

    const again = (await (await notify(owner.apiToken, 'again')).json()) as NotifyResult
    assert.equal(again.status, 'throttled')
    assert.equal(sent.length, 1)
  })

  test('the human who set up a loop stays the recipient after many loop beats', async () => {
    const { user, owner, notify, say } = await seed()
    await say({ text: 'check every 30 min; notify me on errors', senderUserId: user.id })
    for (let beat = 0; beat < 60; beat++) await say({ text: 'beat', loopId: 1 })
    const result = (await (await notify(owner.apiToken, 'errors spiked')).json()) as NotifyResult
    assert.deepEqual(result, { status: 'sent', devices: 1 })
  })

  test('a session only loops have messaged has nobody to notify', async () => {
    const { owner, notify, say } = await seed()
    await say({ text: 'beat', loopId: 1 })
    assert.deepEqual((await (await notify(owner.apiToken, 'hi')).json()) as NotifyResult, {
      status: 'no_recipient',
    })
    assert.equal(sent.length, 0)
  })

  test('another worker cannot notify for a session it does not own', async () => {
    const { project, user, notify, say } = await seed()
    await say({ text: 'go', senderUserId: user.id })
    const stranger = await worker(project.id, 'stranger')
    assert.equal((await notify(stranger.apiToken, 'hi')).status, 403)
    assert.equal(sent.length, 0)
  })
})
