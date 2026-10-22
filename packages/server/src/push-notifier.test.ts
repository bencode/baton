import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { PushMessage } from './push-message.ts'
import { type PushNotifierDeps, runPushPass } from './push-notifier.ts'
import { type ContractCtx, newCtx, seedReq, seedWorker } from './store/contract/helpers.ts'
import type { FinishedTurn, PushSubscriptionRecord } from './store/types.ts'

describe('push store', () => {
  let ctx: ContractCtx
  let sessionId: number
  beforeEach(async () => {
    ctx = await newCtx()
    const { project } = await seedReq(ctx)
    const workerId = await seedWorker(ctx, project)
    const session = await ctx.store.sessions.create({
      projectId: project,
      workerId,
      mode: 'worker',
      name: 'push',
      agentKind: 'codex',
    })
    sessionId = session.id
    await ctx.store.sessions.materialize(sessionId, { agentSessionId: 'pending:t', cwd: '/tmp/t' })
  })
  afterEach(async () => {
    await ctx.cleanup()
  })
  const runTurn = async (outcome: 'completed' | 'failed', replies: string[], message = '') => {
    const claimed = await ctx.store.turns.claim(sessionId, {
      claimId: randomUUID(),
      runnerToken: 'runner',
    })
    assert.equal(claimed.value.kind, 'execute')
    const attemptId = claimed.value.kind === 'execute' ? claimed.value.attempt.id : 0
    for (const [i, text] of replies.entries())
      await ctx.store.turns.event(sessionId, attemptId, 'runner', 'agent_event', {
        type: 'item.completed',
        item: { type: 'agent_message', id: `a${i}`, text },
      })
    await ctx.store.turns.finish(sessionId, attemptId, { runnerToken: 'runner', outcome, message })
  }

  test('finished turns carry their senders and final reply; loops have no sender', async () => {
    const user = await ctx.store.users.create({ username: 'ben', passwordHash: 'x' })
    await ctx.store.inputs.submit(sessionId, { text: 'go', senderUserId: user.id })
    await ctx.store.inputs.submit(sessionId, { text: 'and this', senderUserId: user.id })
    await runTurn('completed', ['looking', 'final answer'])
    await ctx.store.inputs.submit(sessionId, { text: 'beat', loopId: 1 })
    await runTurn('failed', [], 'boom')

    const [done, failed] = await ctx.store.push.finishedTurnsAfter(0, 10)
    assert.equal(done?.type, 'turn_complete')
    assert.deepEqual(done?.senderUserIds, [user.id])
    assert.equal(done?.replyText, 'final answer')
    assert.equal(done?.projectName, 'p')
    assert.ok(done?.finishedAt != null)
    assert.equal(failed?.type, 'turn_error')
    assert.deepEqual(failed?.senderUserIds, [])
    assert.equal(failed?.errorMessage, 'boom')
    assert.deepEqual(await ctx.store.push.finishedTurnsAfter(failed?.eventId ?? 0, 10), [])
  })

  test('re-subscribing an endpoint replaces its keys', async () => {
    const user = await ctx.store.users.create({ username: 'ben', passwordHash: 'x' })
    const endpoint = 'https://push.example/1'
    await ctx.store.push.subscribe(user.id, { endpoint, p256dh: 'old', auth: 'old' })
    await ctx.store.push.subscribe(user.id, { endpoint, p256dh: 'new', auth: 'new' })
    assert.deepEqual(await ctx.store.push.subscriptionsFor([user.id]), [
      { userId: user.id, endpoint, p256dh: 'new', auth: 'new' },
    ])
  })
})

describe('runPushPass', () => {
  const finished = (eventId: number, durationMs: number): FinishedTurn => ({
    eventId,
    type: 'turn_complete',
    retrying: false,
    startedAt: 0,
    finishedAt: durationMs,
    session: { id: 1, name: 's', projectId: 1 },
    projectName: 'p',
    planMode: false,
    senderUserIds: [1],
    replyText: 'done',
  })
  const sub = (endpoint: string): PushSubscriptionRecord => ({
    userId: 1,
    endpoint,
    p256dh: 'k',
    auth: 'a',
  })

  test('starts at the newest event, then pushes and drops dead subscriptions', async () => {
    let cursor: number | null = null
    const removed: string[] = []
    const sent: Array<[string, PushMessage]> = []
    const turns = [finished(41, 60_000), finished(42, 1_000)]
    const deps: PushNotifierDeps = {
      store: {
        push: {
          cursor: async () => cursor,
          setCursor: async id => {
            cursor = id
          },
          latestEventId: async () => 40,
          finishedTurnsAfter: async after => turns.filter(t => t.eventId > after),
          subscribe: async () => {},
          unsubscribe: async endpoint => {
            removed.push(endpoint)
          },
          subscriptionsFor: async () => [sub('live'), sub('gone')],
        },
      },
      send: async (s, message) => {
        if (s.endpoint === 'gone') throw Object.assign(new Error('Gone'), { statusCode: 410 })
        sent.push([s.endpoint, message])
      },
    }

    assert.equal(await runPushPass(deps), 0)
    assert.equal(cursor, 40)
    assert.equal(sent.length, 0)

    assert.equal(await runPushPass(deps), 2)
    assert.deepEqual(
      sent.map(([endpoint, m]) => [endpoint, m.tag]),
      [['live', 'session-1']],
    )
    assert.deepEqual(removed, ['gone'])
    assert.equal(cursor, 42)
  })
})
