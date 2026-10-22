import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MIN_TURN_MS, toPushMessage } from './push-message.ts'
import type { FinishedTurn } from './store/types.ts'

const turn = (patch: Partial<FinishedTurn> = {}): FinishedTurn => ({
  eventId: 1,
  type: 'turn_complete',
  retrying: false,
  startedAt: 0,
  finishedAt: 60_000,
  session: { id: 7, name: '修复登录', projectId: 3 },
  projectName: 'baton',
  planMode: false,
  senderUserIds: [1],
  replyText: '已经修好了',
  ...patch,
})

test('only ended turns somebody sent and stopped watching are pushed', () => {
  assert.deepEqual(toPushMessage(turn()), {
    title: 'baton · 修复登录',
    body: '已经修好了',
    url: '/proj/3/session/7',
    tag: 'session-7',
  })
  assert.equal(toPushMessage(turn({ finishedAt: MIN_TURN_MS - 1 })), null)
  assert.equal(toPushMessage(turn({ type: 'turn_error', retrying: true, finishedAt: null })), null)
  assert.equal(toPushMessage(turn({ senderUserIds: [] })), null)
})

test('the body tells which kind of attention the turn needs', () => {
  const body = (patch: Partial<FinishedTurn>) => toPushMessage(turn(patch))?.body
  assert.equal(body({ type: 'turn_error', errorMessage: 'timeout' }), '失败：timeout')
  assert.equal(
    body({ planMode: true, replyText: '\n## 方案\n1. 改 schema' }),
    '计划已就绪：## 方案',
  )
  assert.equal(body({ replyText: null }), '已完成')
  const long = body({ replyText: 'x'.repeat(500) })
  assert.equal(long?.length, 120)
  assert.ok(long?.endsWith('…'))
})
